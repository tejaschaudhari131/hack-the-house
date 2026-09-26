"""Download, clean, and score the MVP parcels.

Run from the repo root or from pipeline/:

    python pipeline/run_pipeline.py

Raw downloads are cached in pipeline/data/raw (gitignored).
Outputs land in data/processed and web/public/data.
"""

from __future__ import annotations

import csv
import io
import json
import math
import shutil
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import shapefile
import shapely
from shapely.strtree import STRtree

import config
from score import model_card, score_parcel
from util import (
    arcgis_features,
    cached_download,
    envelope,
    esri_envelope,
    fetch_json,
    geojson_to_shape,
    shape_to_geojson,
)

LAT0 = 40.45
LON0 = -79.95
M_PER_DEG_LAT = 111_320.0
M_PER_DEG_LON = 111_320.0 * math.cos(math.radians(LAT0))
SALE_CUTOFF = date.fromisoformat(config.SALE_CUTOFF_ISO)


def pulled_at():
    return datetime.now(timezone.utc).date().isoformat()


def xy(lon, lat):
    return ((float(lon) - LON0) * M_PER_DEG_LON, (float(lat) - LAT0) * M_PER_DEG_LAT)


def parse_sale_date(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    parts = text.replace("/", "-").split("-")
    if len(parts) != 3:
        return None
    try:
        numbers = [int(part) for part in parts]
    except ValueError:
        return None
    if len(parts[0]) == 4:
        year, month, day = numbers
    else:
        first, second, year = numbers
        # Live Allegheny files use month-day-year (example: 09-04-2001).
        # The written dictionary says day-month-year. If the first number
        # cannot be a month, treat it as a day.
        if first > 12:
            day, month = first, second
        else:
            month, day = first, second
    try:
        return date(year, month, day)
    except ValueError:
        return None


def is_valid_sale(record):
    code = str(record.get("SALECODE") or "").strip().upper()
    desc = str(record.get("SALEDESC") or "").strip().upper()
    return code == "0" or desc.startswith("VALID SALE")


def number_or_none(value):
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text == ".":
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if number <= -999999:
        return None
    return number


def census_missing(value):
    number = number_or_none(value)
    return number


def build_address(record):
    number = record.get("PROPERTYHOUSENUM")
    street = str(record.get("PROPERTYADDRESS") or "").strip()
    unit = str(record.get("PROPERTYUNIT") or "").strip()
    house = ""
    if number not in (None, "", " "):
        try:
            as_float = float(number)
            house = str(int(as_float)) if as_float.is_integer() else str(number).strip()
        except (TypeError, ValueError):
            house = str(number).strip()
        if house in {"0", ""}:
            house = ""
    address = " ".join(part for part in (house, street) if part)
    if unit:
        address = f"{address} #{unit}" if address else f"#{unit}"
    return address or None


def load_neighborhoods(refresh):
    print("Neighborhoods", flush=True)
    dest = config.RAW_DIR / "neighborhoods.geojson"
    cached_download(config.NEIGHBORHOODS_URL, dest, refresh=refresh)
    payload = json.loads(dest.read_text())
    wanted = {item["name"]: item["group"] for item in config.MVP_NEIGHBORHOODS}
    selected = []
    for feature in payload["features"]:
        name = feature["properties"].get("hood")
        if name not in wanted:
            continue
        geometry = geojson_to_shape(feature["geometry"])
        if geometry is None:
            continue
        selected.append(
            {
                "name": name,
                "group": wanted[name],
                "geom": geometry,
                "acres_attribute": feature["properties"].get("acres"),
            }
        )
    found = {item["name"] for item in selected}
    missing = sorted(set(wanted) - found)
    if missing:
        raise RuntimeError(f"Neighborhood polygons missing: {missing}")
    return selected


def download_parcels(neighborhoods, refresh):
    print("Parcels", flush=True)
    cache = config.RAW_DIR / "parcels_bbox.geojson"
    if cache.exists() and not refresh:
        payload = json.loads(cache.read_text())
        print(f"  using cache {cache.name} ({len(payload['features'])} features)", flush=True)
        return payload["features"]

    features = []
    seen = set()
    for neighborhood in neighborhoods:
        bounds = envelope(neighborhood["geom"], pad=0.001)
        print(f"  bbox {neighborhood['name']} {bounds}", flush=True)
        extra = {
            "geometry": esri_envelope(bounds),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "PIN,MAPBLOCKLOT,MUNICODE,CALCACREAGE",
        }
        for feature in arcgis_features(config.PARCEL_QUERY_URL, extra, page_size=1000):
            pin = str((feature.get("properties") or {}).get("PIN") or "").strip()
            if not pin or pin in seen:
                continue
            seen.add(pin)
            features.append(feature)
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"  cached {len(features)} bbox parcels", flush=True)
    return features


def _assessment_from_record(record):
    parid = str(record.get("PARID") or "").strip()
    if not parid:
        return None
    keep = {}
    for field in config.ASSESSMENT_FIELDS.split(","):
        if field in record:
            keep[field] = record.get(field)
    keep["PARID"] = parid
    return parid, keep


def download_assessments(refresh):
    """Pull assessment rows for the MVP zips. The clip decides which parcels count."""
    print("Assessments", flush=True)
    cache = config.RAW_DIR / "assessments_mvp.json"
    if cache.exists() and not refresh:
        payload = json.loads(cache.read_text())
        print(f"  using cache ({len(payload)} rows)", flush=True)
        return payload

    rows = {}
    for zip_code in config.ASSESSMENT_ZIPS:
        offset = 0
        while True:
            payload = fetch_json(
                config.ASSESSMENT_SEARCH_URL,
                {
                    "resource_id": config.ASSESSMENT_RESOURCE_ID,
                    "filters": json.dumps({"PROPERTYZIP": zip_code}),
                    "fields": config.ASSESSMENT_FIELDS,
                    "limit": 5000,
                    "offset": offset,
                },
                timeout=180,
            )
            if not payload.get("success"):
                raise RuntimeError(f"Assessment search failed: {payload.get('error')}")
            records = payload["result"]["records"]
            print(f"  zip {zip_code} offset {offset}: {len(records)}", flush=True)
            for record in records:
                parsed = _assessment_from_record(record)
                if parsed:
                    rows[parsed[0]] = parsed[1]
            if len(records) < 5000:
                break
            offset += len(records)
    cache.write_text(json.dumps(rows))
    print(f"  assessment rows in MVP zips: {len(rows)}", flush=True)
    return rows


def _fill_assessments_from_csv(rows, missing_pins, refresh):
    dest = config.RAW_DIR / "assessments.csv"
    cached_download(config.ASSESSMENT_CSV_URL, dest, refresh=refresh)
    found = 0
    with dest.open(newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            parid = str(record.get("PARID") or "").strip()
            if parid not in missing_pins:
                continue
            parsed = _assessment_from_record(record)
            if not parsed:
                continue
            rows[parsed[0]] = parsed[1]
            found += 1
            if found == len(missing_pins):
                break
    print(f"  CSV filled {found} additional parcels", flush=True)
    return rows


def download_zoning(refresh):
    print("Zoning districts", flush=True)
    cache = config.RAW_DIR / "zoning.geojson"
    if cache.exists() and not refresh:
        payload = json.loads(cache.read_text())
        return payload["features"]
    features = list(
        arcgis_features(
            config.ZONING_QUERY_URL,
            {"outFields": "zon_new,full_zoning_type,legendtype"},
            page_size=1000,
        )
    )
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return features


def download_landslide(refresh):
    print("Landslide-prone areas", flush=True)
    cache = config.RAW_DIR / "landslide.geojson"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())["features"]
    features = list(
        arcgis_features(
            config.LANDSLIDE_QUERY_URL,
            {"outFields": "code,landslideprone,acres"},
            page_size=1000,
            order_by="objectid",
        )
    )
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return features


def download_flood(neighborhoods, refresh):
    print("FEMA flood zones", flush=True)
    cache = config.RAW_DIR / "flood.geojson"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())["features"]
    features = []
    seen = set()
    for neighborhood in neighborhoods:
        bounds = envelope(neighborhood["geom"], pad=0.003)
        extra = {
            "geometry": esri_envelope(bounds),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
            "orderByFields": "OBJECTID",
        }
        # Flood layer paging uses the same helper. Some NFHL queries reject orderByFields.
        try:
            page = list(arcgis_features(config.FLOOD_QUERY_URL, extra, page_size=2000))
        except RuntimeError:
            extra.pop("orderByFields", None)
            page = list(arcgis_features(config.FLOOD_QUERY_URL, extra, page_size=2000, order_by=""))
        for feature in page:
            props = feature.get("properties") or {}
            key = (
                props.get("FLD_ZONE"),
                props.get("ZONE_SUBTY"),
                props.get("SFHA_TF"),
                json.dumps(feature.get("geometry", {}).get("coordinates", [])[:1]),
            )
            if key in seen:
                continue
            seen.add(key)
            features.append(feature)
        print(f"  {neighborhood['name']}: running total {len(features)}", flush=True)
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return features


def _filter_census_table(path, prefixes):
    table = {}
    with path.open(encoding="utf-8", errors="replace") as handle:
        header = handle.readline().strip().split("|")
        for line in handle:
            if not any(line.startswith(prefix) for prefix in prefixes):
                continue
            cells = line.rstrip("\n").split("|")
            table[cells[0]] = dict(zip(header, cells))
    return table


def download_census(refresh):
    print("Census ACS 2024 5-year tables", flush=True)
    tables = {}
    prefixes = ("1500000US42003", "1400000US42003", "0500000US42003")
    for name, url in config.CENSUS_TABLES.items():
        dest = config.RAW_DIR / Path(url).name
        cached_download(url, dest, refresh=refresh)
        tables[name] = _filter_census_table(dest, prefixes)
        print(f"  {name}: {len(tables[name])} Allegheny rows", flush=True)
    return tables


def load_block_groups(refresh):
    print("Census block group shapes", flush=True)
    dest = config.RAW_DIR / "cb_2024_42_bg_500k.zip"
    cached_download(config.BLOCK_GROUP_ZIP_URL, dest, refresh=refresh)
    extract = config.RAW_DIR / "cb_2024_42_bg"
    if refresh or not any(extract.glob("*.shp")):
        if extract.exists():
            shutil.rmtree(extract)
        extract.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(dest) as archive:
            archive.extractall(extract)
    shp = next(extract.glob("*.shp"))
    reader = shapefile.Reader(str(shp))
    fields = [field[0] for field in reader.fields[1:]]
    groups = []
    for shape_record in reader.iterShapeRecords():
        values = shape_record.record
        record = dict(zip(fields, values))
        state = str(record.get("STATEFP") or "")
        county = str(record.get("COUNTYFP") or "")
        if state != "42" or county != "003":
            continue
        geometry = as_shape_record(shape_record.shape)
        if geometry is None:
            continue
        geoid = str(record.get("GEOID") or "")
        groups.append({"geoid": geoid, "geom": geometry})
    print(f"  Allegheny block groups: {len(groups)}", flush=True)
    return groups


def as_shape_record(shp):
    return geojson_to_shape(shp.__geo_interface__)


def _service_active(calendar_rows, exception_rows, ref):
    weekday = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")[ref.weekday()]
    ref_text = ref.strftime("%Y%m%d")
    active = set()
    for row in calendar_rows:
        start = row.get("start_date") or ""
        end = row.get("end_date") or ""
        if start and end and start <= ref_text <= end and row.get(weekday) == "1":
            active.add(row.get("service_id"))
    for row in exception_rows:
        if (row.get("date") or "") != ref_text:
            continue
        service_id = row.get("service_id")
        exception = row.get("exception_type")
        if exception == "1":
            active.add(service_id)
        elif exception == "2":
            active.discard(service_id)
    return {service_id for service_id in active if service_id}


def _representative_weekday(feed_start, feed_end, today):
    if feed_end and today > feed_end:
        cursor = feed_end
    else:
        cursor = today
    if feed_start and cursor < feed_start:
        cursor = feed_start
    guard = 0
    while cursor.weekday() >= 5 and guard < 7:
        cursor -= timedelta(days=1)
        guard += 1
        if feed_start and cursor < feed_start:
            cursor = feed_start
            break
    return cursor


def download_transit(neighborhoods, refresh):
    print("PRT GTFS", flush=True)
    dest = config.RAW_DIR / "gtfs.zip"
    cached_download(config.GTFS_URL, dest, refresh=refresh)
    with zipfile.ZipFile(dest) as archive:
        names = {Path(name).name.lower(): name for name in archive.namelist()}

        def read_table(filename):
            key = names.get(filename)
            if key is None:
                return []
            raw = archive.read(key).decode("utf-8-sig", errors="replace")
            return list(csv.DictReader(io.StringIO(raw)))

        feed_info = read_table("feed_info.txt")
        stops = read_table("stops.txt")
        calendar_rows = read_table("calendar.txt")
        exception_rows = read_table("calendar_dates.txt")
        trips = read_table("trips.txt")
        routes = read_table("routes.txt")
        if "stop_times.txt" not in names:
            raise RuntimeError("GTFS zip has no stop_times.txt")

    feed_start = feed_end = None
    if feed_info:
        raw_start = (feed_info[0].get("feed_start_date") or "").strip()
        raw_end = (feed_info[0].get("feed_end_date") or "").strip()
        if len(raw_start) == 8:
            feed_start = datetime.strptime(raw_start, "%Y%m%d").date()
        if len(raw_end) == 8:
            feed_end = datetime.strptime(raw_end, "%Y%m%d").date()
    today = datetime.now(timezone.utc).date()
    ref = _representative_weekday(feed_start, feed_end, today)
    active = _service_active(calendar_rows, exception_rows, ref)
    print(f"  representative weekday {ref.isoformat()} with {len(active)} services", flush=True)
    if not active:
        raise RuntimeError(f"No GTFS services run on {ref.isoformat()}")

    weekday_trips = {
        row.get("trip_id"): row.get("route_id")
        for row in trips
        if row.get("service_id") in active and row.get("trip_id")
    }
    route_names = {
        row.get("route_id"): (row.get("route_short_name") or row.get("route_long_name") or row.get("route_id"))
        for row in routes
    }
    trip_counts = defaultdict(int)
    stop_routes = defaultdict(set)
    with zipfile.ZipFile(dest) as archive:
        raw = archive.read(names["stop_times.txt"]).decode("utf-8-sig", errors="replace")
    for row in csv.DictReader(io.StringIO(raw)):
        trip_id = row.get("trip_id")
        if trip_id not in weekday_trips:
            continue
        stop_id = row.get("stop_id")
        trip_counts[stop_id] += 1
        route_id = weekday_trips[trip_id]
        if route_id:
            stop_routes[stop_id].add(route_names.get(route_id, route_id))

    union = shapely.union_all([item["geom"] for item in neighborhoods])
    minx, miny, maxx, maxy = envelope(union, pad=0.02)
    kept = []
    for stop in stops:
        try:
            lon = float(stop.get("stop_lon"))
            lat = float(stop.get("stop_lat"))
        except (TypeError, ValueError):
            continue
        if not (minx <= lon <= maxx and miny <= lat <= maxy):
            continue
        stop_id = stop.get("stop_id")
        point = xy(lon, lat)
        kept.append(
            {
                "stop_id": stop_id,
                "name": (stop.get("stop_name") or "").strip(),
                "lon": lon,
                "lat": lat,
                "x": point[0],
                "y": point[1],
                "trips": int(trip_counts.get(stop_id, 0)),
                "routes": sorted(stop_routes.get(stop_id, [])),
            }
        )
    print(f"  stops near MVP area: {len(kept)}", flush=True)
    return {"stops": kept, "service_date": ref.isoformat(), "feed_end": feed_end.isoformat() if feed_end else None}


def _lookup_census(tables, geoid):
    """Prefer the block group. Fall back to the tract and say so."""
    bg_key = f"1500000US{geoid}"
    tract_key = f"1400000US{geoid[:11]}" if len(geoid) >= 11 else None
    income_row = tables["B19013"].get(bg_key)
    rent_row = tables["B25070"].get(bg_key)
    gross_row = tables["B25064"].get(bg_key)
    geography = "block_group"
    if income_row is None and tract_key:
        income_row = tables["B19013"].get(tract_key)
        rent_row = tables["B25070"].get(tract_key)
        gross_row = tables["B25064"].get(tract_key)
        if income_row or rent_row:
            geography = "tract"
    if income_row is None and rent_row is None:
        return None
    income = census_missing((income_row or {}).get("B19013_E001"))
    income_moe = census_missing((income_row or {}).get("B19013_M001"))
    gross = census_missing((gross_row or {}).get("B25064_E001"))
    burden = None
    if rent_row:
        total = census_missing(rent_row.get("B25070_E001"))
        not_computed = census_missing(rent_row.get("B25070_E011")) or 0
        parts = [census_missing(rent_row.get(f"B25070_E00{i}")) for i in (7, 8, 9)]
        parts.append(census_missing(rent_row.get("B25070_E010")))
        if total and all(part is not None for part in parts):
            denom = total - not_computed
            if denom > 0:
                burden = round(sum(parts) / denom, 3)
    return {
        "census_geoid": geoid if geography == "block_group" else geoid[:11],
        "census_geography": geography,
        "median_income": income,
        "income_moe": income_moe,
        "rent_burden_share": burden,
        "median_gross_rent": gross,
    }


def _county_median(tables):
    row = tables["B19013"].get("0500000US42003")
    if not row:
        return None
    return census_missing(row.get("B19013_E001"))


def _zone_kind(properties):
    zone = str(properties.get("FLD_ZONE") or "").upper()
    subtype = str(properties.get("ZONE_SUBTY") or "").upper()
    sfha_flag = str(properties.get("SFHA_TF") or "").upper() == "T"
    if sfha_flag or zone in {"A", "AE", "AH", "AO", "AR", "A99", "V", "VE"}:
        return "sfha"
    if "0.2" in subtype:
        return "flood_02"
    return None


def _overlap(parcel, hazard):
    if hazard is None or hazard.is_empty or parcel.is_empty or parcel.area == 0:
        return 0.0
    if not parcel.intersects(hazard):
        return 0.0
    return float(parcel.intersection(hazard).area / parcel.area)


def _transit_for_point(point_xy, stops):
    px, py = point_xy
    nearest = None
    trips_400 = 0
    stops_800 = 0
    routes = set()
    for stop in stops:
        dist = math.hypot(px - stop["x"], py - stop["y"])
        if nearest is None or dist < nearest[0]:
            nearest = (dist, stop)
        if dist <= 800:
            stops_800 += 1
        if dist <= 400:
            trips_400 += stop["trips"]
            routes.update(stop["routes"])
    return {
        "trips_within_400m": trips_400,
        "stops_within_800m": stops_800,
        "nearest_stop_m": None if nearest is None else round(nearest[0]),
        "nearest_stop_name": None if nearest is None else nearest[1]["name"],
        "routes_within_400m": sorted(routes)[:8],
    }


def _neighborhood_market(parcels):
    stats = {}
    grouped = defaultdict(list)
    for parcel in parcels:
        grouped[parcel["neighborhood"]].append(parcel)
    for name, rows in grouped.items():
        prices = []
        sales = 0
        for row in rows:
            sale = row.get("_sale")
            if not sale:
                continue
            sales += 1
            if sale.get("ppsf") is not None:
                prices.append(sale["ppsf"])
        prices.sort()
        median = None
        if prices:
            mid = len(prices) // 2
            if len(prices) % 2:
                median = prices[mid]
            else:
                median = (prices[mid - 1] + prices[mid]) / 2
        turnover = round(100 * sales / len(rows), 2) if rows else None
        stats[name] = {
            "parcel_count": len(rows),
            "valid_sales": sales,
            "price_per_sqft": None if median is None else round(median, 1),
            "turnover_per_100": turnover,
        }
    return stats


def assemble(neighborhoods, parcel_features, assessments, zoning_features, flood_features, landslide_features, block_groups, census_tables, transit):
    print("Joining parcels to neighborhoods and layers", flush=True)
    hood_geoms = [item["geom"] for item in neighborhoods]
    hood_tree = STRtree(hood_geoms)
    zone_shapes = []
    zone_props = []
    for feature in zoning_features:
        geometry = geojson_to_shape(feature.get("geometry"))
        if geometry is None:
            continue
        zone_shapes.append(geometry)
        zone_props.append(feature.get("properties") or {})
    zone_tree = STRtree(zone_shapes) if zone_shapes else None

    bg_shapes = [item["geom"] for item in block_groups]
    bg_tree = STRtree(bg_shapes) if bg_shapes else None

    sfha_parts = []
    shaded_parts = []
    for feature in flood_features:
        kind = _zone_kind(feature.get("properties") or {})
        if kind is None:
            continue
        geometry = geojson_to_shape(feature.get("geometry"))
        if geometry is None:
            continue
        if kind == "sfha":
            sfha_parts.append(geometry)
        else:
            shaded_parts.append(geometry)
    sfha = shapely.union_all(sfha_parts) if sfha_parts else None
    shaded = shapely.union_all(shaded_parts) if shaded_parts else None
    slide_parts = []
    for feature in landslide_features:
        geometry = geojson_to_shape(feature.get("geometry"))
        if geometry is not None:
            slide_parts.append(geometry)
    landslide = shapely.union_all(slide_parts) if slide_parts else None
    stops = transit["stops"] if transit else []

    parcels = []
    for feature in parcel_features:
        geometry = geojson_to_shape(feature.get("geometry"))
        if geometry is None or geometry.area == 0:
            continue
        hits = hood_tree.query(geometry, predicate="intersects")
        if len(hits) == 0:
            continue
        point = geometry.representative_point()
        best = None
        best_area = 0
        for index in hits:
            hood = neighborhoods[int(index)]
            area = hood["geom"].intersection(geometry).area
            if area > best_area:
                best_area = area
                best = hood
        if best is None:
            continue
        if not best["geom"].covers(point) and best_area < 0.5 * geometry.area:
            continue
        props = feature.get("properties") or {}
        pin = str(props.get("PIN") or "").strip()
        assessment = assessments.get(pin)
        record = {
            "pin": pin,
            "geometry": geometry,
            "neighborhood": best["name"],
            "area": best["group"],
            "map_block_lot": props.get("MAPBLOCKLOT"),
            "calc_acres": props.get("CALCACREAGE"),
            "assessment_joined": assessment is not None,
        }
        if assessment:
            record["address"] = build_address(assessment)
            record["zip"] = assessment.get("PROPERTYZIP")
            record["land_use"] = (assessment.get("USEDESC") or "").strip() or None
            record["land_use_class"] = (assessment.get("CLASSDESC") or "").strip() or None
            record["lot_sqft"] = number_or_none(assessment.get("LOTAREA"))
            record["year_built"] = number_or_none(assessment.get("YEARBLT"))
            record["living_sqft"] = number_or_none(assessment.get("FINISHEDLIVINGAREA"))
            if is_valid_sale(assessment):
                sold = parse_sale_date(assessment.get("SALEDATE"))
                price = number_or_none(assessment.get("SALEPRICE"))
                if sold and sold >= SALE_CUTOFF and price and price >= 10000:
                    ppsf = None
                    living = record["living_sqft"]
                    if living and living >= 400:
                        ppsf = price / living
                    record["_sale"] = {"date": sold.isoformat(), "price": price, "ppsf": ppsf}
                    record["last_valid_sale_year"] = sold.year
                    record["last_valid_sale_price"] = price
        else:
            record["address"] = None
            record["lot_sqft"] = None
            if props.get("CALCACREAGE"):
                acres = number_or_none(props.get("CALCACREAGE"))
                if acres:
                    record["lot_sqft"] = round(acres * 43560)
        if record.get("lot_sqft") is None and props.get("CALCACREAGE"):
            acres = number_or_none(props.get("CALCACREAGE"))
            if acres:
                record["lot_sqft"] = round(acres * 43560)

        record["zoning_code"] = None
        record["zoning_label"] = None
        if zone_tree is not None:
            zone_hits = zone_tree.query(point, predicate="intersects")
            if len(zone_hits) == 0:
                zone_hits = zone_tree.query(geometry, predicate="intersects")
            if len(zone_hits):
                chosen = zone_props[int(zone_hits[0])]
                if len(zone_hits) > 1:
                    best_zone = None
                    best_zone_area = -1
                    for index in zone_hits:
                        area = zone_shapes[int(index)].intersection(geometry).area
                        if area > best_zone_area:
                            best_zone_area = area
                            best_zone = zone_props[int(index)]
                    chosen = best_zone
                record["zoning_code"] = (chosen.get("zon_new") or "").strip() or None
                record["zoning_label"] = (chosen.get("full_zoning_type") or chosen.get("legendtype") or "").strip() or None

        record["census_geoid"] = None
        record["census_geography"] = None
        record["median_income"] = None
        record["income_moe"] = None
        record["rent_burden_share"] = None
        record["median_gross_rent"] = None
        if bg_tree is not None and census_tables is not None:
            bg_hits = bg_tree.query(point, predicate="intersects")
            if len(bg_hits):
                census = _lookup_census(census_tables, block_groups[int(bg_hits[0])]["geoid"])
                if census:
                    record.update(census)

        record["sfha_overlap"] = round(_overlap(geometry, sfha), 3) if flood_features is not None else None
        record["flood_02_overlap"] = round(_overlap(geometry, shaded), 3) if flood_features is not None else None
        record["landslide_overlap"] = round(_overlap(geometry, landslide), 3) if landslide_features is not None else None
        zones = []
        if record["sfha_overlap"]:
            zones.append("SFHA")
        if record["flood_02_overlap"]:
            zones.append("0.2%")
        record["flood_zones"] = zones
        # A successful download that finds no overlap is a real zero, not a missing layer.
        record["flood_available"] = flood_features is not None
        record["landslide_available"] = landslide_features is not None
        record["transit_available"] = transit is not None
        if transit is not None:
            record.update(_transit_for_point(xy(point.x, point.y), stops))
        else:
            record["trips_within_400m"] = None
            record["nearest_stop_m"] = None
        parcels.append(record)
    print(f"  parcels inside MVP neighborhoods: {len(parcels)}", flush=True)
    return parcels


def _public_feature(record):
    scores = record["score"]["scores"]
    properties = {
        "pin": record["pin"],
        "address": record.get("address"),
        "zip": record.get("zip"),
        "neighborhood": record["neighborhood"],
        "area": record["area"],
        "land_use": record.get("land_use"),
        "land_use_class": record.get("land_use_class"),
        "lot_sqft": record.get("lot_sqft"),
        "year_built": None if record.get("year_built") is None else int(record["year_built"]),
        "living_sqft": record.get("living_sqft"),
        "last_valid_sale_year": record.get("last_valid_sale_year"),
        "last_valid_sale_price": record.get("last_valid_sale_price"),
        "zoning_code": record.get("zoning_code"),
        "zoning_label": record.get("zoning_label"),
        "census_geoid": record.get("census_geoid"),
        "census_geography": record.get("census_geography"),
        "median_income": record.get("median_income"),
        "income_moe": record.get("income_moe"),
        "rent_burden_share": record.get("rent_burden_share"),
        "median_gross_rent": record.get("median_gross_rent"),
        "flood_zones": record.get("flood_zones") or [],
        "sfha_overlap": record.get("sfha_overlap"),
        "flood_02_overlap": record.get("flood_02_overlap"),
        "landslide_overlap": record.get("landslide_overlap"),
        "trips_within_400m": record.get("trips_within_400m"),
        "stops_within_800m": record.get("stops_within_800m"),
        "nearest_stop_m": record.get("nearest_stop_m"),
        "nearest_stop_name": record.get("nearest_stop_name"),
        "routes_within_400m": record.get("routes_within_400m") or [],
        "scores": scores,
        "factors": record["score"]["factors"],
        "confidence": record["score"]["confidence"],
        "confidence_label": record["score"]["confidence_label"],
        "confidence_notes": record["score"]["confidence_notes"],
    }
    blob = json.dumps(properties).lower()
    for fragment in config.FORBIDDEN_OUTPUT_FRAGMENTS:
        if fragment in blob:
            raise RuntimeError(f"Refusing to write parcel output that contains '{fragment}'")
    simplified = record["geometry"].simplify(0.00004, preserve_topology=True)
    if simplified.is_empty:
        simplified = record["geometry"]
    return {
        "type": "Feature",
        "id": record["pin"],
        "properties": properties,
        "geometry": shape_to_geojson(simplified),
    }


def _source(name, url, publisher, license_name, status, notes, extra=None):
    row = {
        "name": name,
        "url": url,
        "publisher": publisher,
        "pulled_at": pulled_at(),
        "license": license_name,
        "status": status,
        "notes": notes,
    }
    if extra:
        row.update(extra)
    return row


def write_outputs(neighborhoods, parcels, market, county_income, sources, transit_meta, failures):
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    config.WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    features = [_public_feature(record) for record in parcels]
    parcels_fc = {"type": "FeatureCollection", "features": features}
    hood_features = []
    for neighborhood in neighborhoods:
        hood_features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": neighborhood["name"],
                    "group": neighborhood["group"],
                    "acres_attribute": neighborhood.get("acres_attribute"),
                    "parcel_count": market.get(neighborhood["name"], {}).get("parcel_count", 0),
                    **market.get(neighborhood["name"], {}),
                },
                "geometry": shape_to_geojson(neighborhood["geom"].simplify(0.00005, preserve_topology=True)),
            }
        )
    hood_fc = {"type": "FeatureCollection", "features": hood_features}
    by_area = defaultdict(int)
    zoning_counts = defaultdict(int)
    for record in parcels:
        by_area[record["area"]] += 1
        zoning_counts[record.get("zoning_code") or "(none)"] += 1
    rules = json.loads(config.ZONING_RULES_PATH.read_text())
    known = set(rules.get("districts", {}))
    unmapped = sorted(code for code in zoning_counts if code not in known and code != "(none)")
    summary = {
        "project": "Housing Typology, Equity & Climate Matchmaker",
        "pulled_at": pulled_at(),
        "why_these_places": config.WHY_THESE_PLACES,
        "sale_cutoff": config.SALE_CUTOFF_ISO,
        "sale_rule": "SALECODE 0 or SALEDESC starting with VALID SALE, price at least $10,000, on or after the cutoff. Nominal and multi-parcel sales are excluded.",
        "county_median_income": county_income,
        "county_median_income_source": "ACS 2024 5-year B19013 for Allegheny County (GEOID 0500000US42003)",
        "parcel_count": len(parcels),
        "parcels_by_area": dict(by_area),
        "neighborhoods": [
            {
                "name": neighborhood["name"],
                "group": neighborhood["group"],
                **market.get(neighborhood["name"], {}),
            }
            for neighborhood in neighborhoods
        ],
        "zoning_codes_observed": dict(sorted(zoning_counts.items(), key=lambda item: -item[1])),
        "zoning_codes_unmapped": unmapped,
        "transit_service_date": None if not transit_meta else transit_meta.get("service_date"),
        "sources_failed": failures,
        "decision_support_only": True,
    }
    zoning_review = {
        "needs_expert_review": True,
        "rules_file": "zoning/districts.json",
        "observed_codes": summary["zoning_codes_observed"],
        "unmapped_codes": unmapped,
        "note": "Allowances are stubs inferred from district titles. Chris should review every row against the current zoning code.",
    }
    card = model_card()
    files = {
        "parcels.geojson": parcels_fc,
        "neighborhoods.geojson": hood_fc,
        "summary.json": summary,
        "sources.json": sources,
        "score_model.json": card,
        "zoning_review.json": zoning_review,
    }
    for name, payload in files.items():
        text = json.dumps(payload, separators=(",", ":")) if name.endswith(".geojson") else json.dumps(payload, indent=2)
        for folder in (config.PROCESSED_DIR, config.WEB_DATA_DIR):
            (folder / name).write_text(text + "\n")
    for folder in (config.PROCESSED_DIR, config.WEB_DATA_DIR):
        shutil.copyfile(config.ZONING_RULES_PATH, folder / "zoning.json")
    print(f"Wrote {len(features)} parcels to {config.PROCESSED_DIR} and {config.WEB_DATA_DIR}", flush=True)


def _run_step(sources, failures, name, url, publisher, license_name, notes, func):
    try:
        result = func()
        sources.append(
            _source(name, url, publisher, license_name, "ok", notes)
        )
        return result
    except Exception as error:  # noqa: BLE001 - record the failure, do not invent data
        message = f"{type(error).__name__}: {error}"
        print(f"FAILED {name}: {message}", flush=True)
        sources.append(_source(name, url, publisher, license_name, "failed", notes, {"error": message}))
        failures.append({"name": name, "error": message})
        return None


def main(refresh=False):
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    sources = []
    failures = []
    when = pulled_at()
    sources.append(
        _source(
            "Census API (not used)",
            "https://api.census.gov/data/2024/acs/acs5",
            "U.S. Census Bureau",
            "Public domain",
            "unavailable",
            config.CENSUS_API_NOTE,
        )
    )
    neighborhoods = _run_step(
        sources,
        failures,
        "Pittsburgh neighborhood boundaries",
        config.NEIGHBORHOODS_URL,
        "City of Pittsburgh, via Western Pennsylvania Regional Data Center",
        "Creative Commons Attribution (CC BY) on the WPRDC neighborhoods dataset",
        "Official neighborhood polygons. MVP keeps Hazelwood plus Lower, Central, and Upper Lawrenceville.",
        lambda: load_neighborhoods(refresh),
    )
    if not neighborhoods:
        raise SystemExit("Cannot continue without neighborhood boundaries.")

    parcel_features = _run_step(
        sources,
        failures,
        "Allegheny County parcel boundaries",
        config.PARCEL_QUERY_URL,
        "Allegheny County GIS",
        "License not specified on the county MapServer. WPRDC's parcel-boundary dataset, which points at PASDA for the archival file, is also 'license not specified'.",
        "Geometry, PIN, map-block-lot, and calculated acreage for parcels in the neighborhood bounding boxes. Clipped to neighborhood polygons in a later step. No owner fields are on this layer.",
        lambda: download_parcels(neighborhoods, refresh),
    )
    if not parcel_features:
        raise SystemExit("Cannot continue without parcels.")

    assessments = _run_step(
        sources,
        failures,
        "Allegheny County property assessments",
        "https://data.wprdc.org/dataset/property-assessments",
        "Allegheny County Office of Property Assessments, redistributed by the Western Pennsylvania Regional Data Center",
        "Creative Commons CC0",
        "Land use, lot area, year built, living area, and sale fields for zips 15201 and 15207. If more than 10 percent of clipped parcels are still unmatched, the pipeline streams the county CSV for those parcel IDs only. Owner names are not in this extract. CHANGENOTICE address fields are never requested or written.",
        lambda: download_assessments(refresh),
    ) or {}

    zoning_features = _run_step(
        sources,
        failures,
        "City of Pittsburgh zoning districts",
        config.ZONING_QUERY_URL,
        "City of Pittsburgh GIS (gis@pittsburghpa.gov), via WPRDC",
        "License not specified on the WPRDC zoning resource",
        "District code zon_new and the district title. Which housing types are allowed is NOT taken from this layer. That stub lives in zoning/districts.json and needs expert review.",
        lambda: download_zoning(refresh),
    )
    flood_features = _run_step(
        sources,
        failures,
        "FEMA National Flood Hazard Layer flood zones",
        "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
        "Federal Emergency Management Agency",
        "Public domain, U.S. federal work",
        "Effective flood hazard zones (layer 28) intersecting the MVP neighborhoods. Special Flood Hazard Area uses SFHA_TF and zone codes A/AE/AH/AO/V/VE. The 0.2-percent zone is read from ZONE_SUBTY.",
        lambda: download_flood(neighborhoods, refresh),
    )
    landslide_features = _run_step(
        sources,
        failures,
        "City of Pittsburgh landslide-prone areas",
        config.LANDSLIDE_QUERY_URL,
        "City of Pittsburgh GIS, via WPRDC",
        "License not specified on the WPRDC landslide-prone areas resource",
        "Polygons flagged landslide-prone. Overlap with each parcel is the measured input.",
        lambda: download_landslide(refresh),
    )
    census_tables = _run_step(
        sources,
        failures,
        "ACS 2024 5-year tables B19013, B25064, and B25070",
        config.CENSUS_TABLES["B19013"],
        "U.S. Census Bureau",
        "Public domain",
        "Median household income, median gross rent, and gross rent as a percentage of household income. Filtered to Allegheny County block groups, tracts, and the county summary. "
        + config.CENSUS_API_NOTE,
        lambda: download_census(refresh),
    )
    block_groups = None
    if census_tables is not None:
        block_groups = _run_step(
            sources,
            failures,
            "Census cartographic block groups, Pennsylvania 2024",
            config.BLOCK_GROUP_ZIP_URL,
            "U.S. Census Bureau",
            "Public domain",
            "2024 cartographic boundary file cb_2024_42_bg_500k, filtered to Allegheny County. Used only to assign a block group to each parcel. NAD83 coordinates are used as WGS84; the difference is small relative to a block group.",
            lambda: load_block_groups(refresh),
        )
    transit = _run_step(
        sources,
        failures,
        "Pittsburgh Regional Transit GTFS",
        config.GTFS_URL,
        "Pittsburgh Regional Transit",
        "PRT Developer License Agreement, accepted by downloading the public GTFS zip. See https://www.rideprt.org/business-center/developer-resources/",
        "stops.txt, trips.txt, calendar.txt, calendar_dates.txt, routes.txt, and stop_times.txt. Weekday trip counts use one representative weekday inside the feed's service window.",
        lambda: download_transit(neighborhoods, refresh),
    )

    def clip_once():
        return assemble(
            neighborhoods,
            parcel_features,
            assessments,
            zoning_features or [],
            None if flood_features is None else flood_features,
            None if landslide_features is None else landslide_features,
            block_groups or [],
            census_tables,
            transit,
        )

    parcels = clip_once()
    if parcels:
        missing_pins = {record["pin"] for record in parcels if not record["assessment_joined"]}
        miss_rate = len(missing_pins) / len(parcels)
        print(f"Assessment match after clip: {len(parcels) - len(missing_pins)}/{len(parcels)}", flush=True)
        if miss_rate > 0.10:
            print("More than 10% unmatched. Streaming the assessment CSV for the missing parcel IDs.", flush=True)
            try:
                _fill_assessments_from_csv(assessments, missing_pins, refresh)
                cache = config.RAW_DIR / "assessments_mvp.json"
                cache.write_text(json.dumps(assessments))
                parcels = clip_once()
            except Exception as error:  # noqa: BLE001
                message = f"{type(error).__name__}: {error}"
                print(f"FAILED assessment CSV fill: {message}", flush=True)
                failures.append({"name": "Assessment CSV fill", "error": message})
    if not parcels:
        raise SystemExit("Spatial clip produced zero parcels.")
    market = _neighborhood_market(parcels)
    county_income = _county_median(census_tables) if census_tables else None
    print("Scoring", flush=True)
    for record in parcels:
        neighborhood_stats = market[record["neighborhood"]]
        record["score"] = score_parcel(record, neighborhood_stats, county_income)
    transit_meta = None if transit is None else {"service_date": transit.get("service_date")}
    write_outputs(neighborhoods, parcels, market, county_income, sources, transit_meta, failures)
    if failures:
        print("Completed with source failures:", ", ".join(item["name"] for item in failures), flush=True)
    else:
        print("Completed with all sources loaded.", flush=True)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build the MVP parcel dataset")
    parser.add_argument("--refresh", action="store_true", help="Ignore cached raw downloads")
    args = parser.parse_args()
    main(refresh=args.refresh)
