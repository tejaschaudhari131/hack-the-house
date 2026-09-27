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
from score import chas_low_income_renter_cost_burden, model_card, score_parcel
from sites import parse_city_owned, parse_condemned, parse_tax_delinquency, site_flags
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


def _features_in_neighborhoods(neighborhoods, query_url, out_fields, page_size=500):
    features = []
    seen = set()
    for neighborhood in neighborhoods:
        bounds = envelope(neighborhood["geom"], pad=0.002)
        extra = {
            "geometry": esri_envelope(bounds),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": out_fields,
        }
        page = list(arcgis_features(query_url, extra, page_size=page_size, order_by=""))
        for feature in page:
            props = feature.get("properties") or {}
            # PGHWebSlope25 repeats objectid on every polygon. objectid_1 is the unique id.
            key = props.get("objectid_1")
            if key is None:
                key = props.get("objectid") or props.get("OBJECTID")
            if key is None:
                key = json.dumps(feature.get("geometry"), sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            features.append(feature)
    return features


def download_steep_slopes(neighborhoods, refresh):
    print("Steep slopes, 25 percent or greater", flush=True)
    cache = config.RAW_DIR / "steep_slopes.geojson"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())["features"]
    features = _features_in_neighborhoods(
        neighborhoods, config.STEEP_SLOPE_QUERY_URL, "slope25,objectid_1"
    )
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"  steep-slope polygons in the MVP boxes: {len(features)}", flush=True)
    return features


def download_undermined(neighborhoods, refresh):
    print("Undermined areas", flush=True)
    cache = config.RAW_DIR / "undermined.geojson"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())["features"]
    features = _features_in_neighborhoods(neighborhoods, config.UNDERMINED_QUERY_URL, "undermined,objectid")
    cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    print(f"  undermined polygons in the MVP boxes: {len(features)}", flush=True)
    return features


def download_flood(neighborhoods, refresh):
    print("FEMA flood zones", flush=True)
    cache = config.RAW_DIR / "flood.geojson"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())["features"]
    features = []
    seen = set()
    # Zone X "minimal hazard" polygons are county-sized. Asking for them blows up
    # the FEMA service. Minimal hazard is a measured zero in the score, so the
    # query keeps Special Flood Hazard Areas and 0.2% zones only.
    for neighborhood in neighborhoods:
        bounds = envelope(neighborhood["geom"], pad=0.003)
        extra = {
            "where": "SFHA_TF='T' OR ZONE_SUBTY LIKE '%0.2%'",
            "geometry": esri_envelope(bounds),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
        }
        page = list(arcgis_features(config.FLOOD_QUERY_URL, extra, page_size=40, order_by=""))
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
    trip_rows = sum(stop["trips"] for stop in kept)
    print(
        f"  stops near MVP area: {len(kept)}; weekday trip-stop rows among them: {trip_rows}",
        flush=True,
    )
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


def load_chas(refresh):
    """2018-2022 CHAS Table 8, Allegheny County census tracts (summary level 140)."""
    dest = config.RAW_DIR / "2018thru2022-140-csv.zip"
    cached_download(config.CHAS_TRACT_ZIP_URL, dest, refresh=refresh)
    if not zipfile.is_zipfile(dest):
        dest.unlink(missing_ok=True)
        raise RuntimeError(
            "huduser.gov answered with a bot challenge instead of the zip (it did on 2026-09-27). "
            f"Download {config.CHAS_TRACT_ZIP_URL} in a browser and save it as {dest}, then rerun."
        )
    by_tract = {}
    with zipfile.ZipFile(dest) as archive:
        with archive.open("140/Table8.csv") as handle:
            text = io.TextIOWrapper(handle, encoding="latin-1", newline="")
            reader = csv.DictReader(text)
            for row in reader:
                if (row.get("st") or "").strip() != "42":
                    continue
                if (row.get("cnty") or "").strip() != "003":
                    continue
                if (row.get("sumlevel") or "").strip() != "140":
                    continue
                geoid = (row.get("geoid") or "").strip()
                tract = geoid[-11:]
                if len(tract) != 11 or not tract.isdigit() or not tract.startswith("42003"):
                    continue
                parsed = chas_low_income_renter_cost_burden(row)
                if tract in by_tract:
                    raise RuntimeError(f"CHAS Table 8 has more than one Allegheny row for tract {tract}")
                by_tract[tract] = parsed
    if not by_tract:
        raise RuntimeError("CHAS Table 8 had no Allegheny County tract rows")
    measured = sum(1 for value in by_tract.values() if value)
    print(f"  CHAS Allegheny tracts: {len(by_tract)}; with a cost-burden share: {measured}", flush=True)
    return by_tract


def _wprdc_rows(cache_name, resource_id, fields, refresh):
    """Datastore CSV dump limited to named fields, so owner columns never download."""
    dest = config.RAW_DIR / f"{cache_name}.csv"
    url = config.WPRDC_DUMP_URL.format(resource_id=resource_id) + "?fields=" + fields
    cached_download(url, dest, refresh=refresh)
    with dest.open(newline="", encoding="utf-8-sig", errors="replace") as handle:
        rows = list(csv.DictReader(handle))
    header = set(rows[0].keys()) if rows else set()
    for fragment in config.FORBIDDEN_OUTPUT_FRAGMENTS:
        if any(fragment in key.lower() for key in header):
            raise RuntimeError(f"{cache_name} dump returned a field containing '{fragment}'")
    return rows


def download_city_owned(refresh):
    print("City-owned properties", flush=True)
    rows = _wprdc_rows("city_owned", config.CITY_OWNED_RESOURCE_ID, config.CITY_OWNED_FIELDS, refresh)
    parsed = parse_city_owned(rows)
    print(f"  city-owned parcel ids: {len(parsed)}", flush=True)
    return parsed


def download_tax_delinquency(refresh):
    print("City property tax delinquency", flush=True)
    rows = _wprdc_rows(
        "tax_delinquency", config.TAX_DELINQUENCY_RESOURCE_ID, config.TAX_DELINQUENCY_FIELDS, refresh
    )
    parsed = parse_tax_delinquency(rows)
    print(f"  delinquent parcel ids: {len(parsed)}", flush=True)
    return parsed


def download_condemned(refresh):
    print("Condemned and dead-end properties", flush=True)
    rows = _wprdc_rows("condemned", config.CONDEMNED_RESOURCE_ID, config.CONDEMNED_FIELDS, refresh)
    parsed = parse_condemned(rows)
    print(f"  condemned or dead-end parcel ids: {len(parsed)}", flush=True)
    return parsed


def download_lihtc(neighborhoods, refresh):
    print("HUD LIHTC properties", flush=True)
    cache = config.RAW_DIR / "lihtc.geojson"
    if cache.exists() and not refresh:
        features = json.loads(cache.read_text())["features"]
    else:
        union = shapely.union_all([item["geom"] for item in neighborhoods])
        extra = {
            "geometry": esri_envelope(envelope(union, pad=0.02)),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": config.LIHTC_FIELDS,
        }
        features = list(arcgis_features(config.LIHTC_QUERY_URL, extra, page_size=1000, order_by=""))
        cache.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    projects = []
    for feature in features:
        coords = (feature.get("geometry") or {}).get("coordinates")
        if not coords or len(coords) < 2:
            continue
        props = feature.get("properties") or {}
        lon, lat = float(coords[0]), float(coords[1])
        point = xy(lon, lat)
        projects.append(
            {
                "hud_id": props.get("HUD_ID"),
                "project": (props.get("PROJECT") or "").strip() or None,
                "units": number_or_none(props.get("N_UNITS")),
                "li_units": number_or_none(props.get("LI_UNITS")),
                "year_placed_in_service": number_or_none(props.get("YR_PIS")),
                "lon": lon,
                "lat": lat,
                "x": point[0],
                "y": point[1],
            }
        )
    print(f"  LIHTC projects near the MVP area: {len(projects)}", flush=True)
    return projects


def download_qct(refresh):
    print("HUD Qualified Census Tracts 2026", flush=True)
    cache = config.RAW_DIR / "qct_2026_allegheny.json"
    if cache.exists() and not refresh:
        return set(json.loads(cache.read_text()))
    payload = fetch_json(
        config.QCT_QUERY_URL,
        {
            "where": "GEOID LIKE '42003%'",
            "outFields": "GEOID",
            "returnGeometry": "false",
            "f": "json",
            "resultRecordCount": 2000,
        },
    )
    if payload.get("error"):
        raise RuntimeError(f"QCT query failed: {payload['error']}")
    tracts = sorted({str(item["attributes"]["GEOID"]) for item in payload.get("features") or []})
    if not tracts:
        raise RuntimeError("QCT query returned no Allegheny County tracts")
    cache.write_text(json.dumps(tracts))
    print(f"  Allegheny QCTs: {len(tracts)}", flush=True)
    return set(tracts)


def download_tenure(refresh):
    print("ACS 2024 5-year B25003 tenure", flush=True)
    dest = config.RAW_DIR / Path(config.CENSUS_TENURE_URL).name
    cached_download(config.CENSUS_TENURE_URL, dest, refresh=refresh)
    table = _filter_census_table(dest, ("1400000US42003", "0500000US42003"))
    shares = {}
    for geoid, row in table.items():
        total = census_missing(row.get("B25003_E001"))
        renters = census_missing(row.get("B25003_E003"))
        if total and renters is not None and total > 0:
            shares[geoid.split("US", 1)[1]] = round(renters / total, 3)
    print(f"  tracts with a renter share: {len(shares) - (1 if '42003' in shares else 0)}", flush=True)
    return shares


def load_rent_2019(refresh):
    """Median gross rent, ACS 2015-2019 5-year, Allegheny tracts and county."""
    print("ACS 2015-2019 5-year B25064 median gross rent", flush=True)
    lookup = config.RAW_DIR / "ACS_5yr_Seq_Table_Number_Lookup_2019.txt"
    cached_download(config.ACS2019_SEQ_LOOKUP_URL, lookup, refresh=refresh)
    sequence = start = None
    with lookup.open(encoding="latin-1") as handle:
        for row in csv.DictReader(handle):
            if row.get("Table ID") == "B25064" and (row.get("Start Position") or "").strip():
                sequence = row["Sequence Number"].strip()
                start = int(row["Start Position"])
                break
    if (sequence, start) != (config.ACS2019_B25064_SEQUENCE, config.ACS2019_B25064_START_POSITION):
        raise RuntimeError(f"B25064 moved in the 2019 lookup: sequence {sequence}, start {start}")
    geo = config.RAW_DIR / "g20195pa.csv"
    cached_download(config.ACS2019_GEO_URL, geo, refresh=refresh)
    logrec_to_geoid = {}
    with geo.open(encoding="latin-1", newline="") as handle:
        for cells in csv.reader(handle):
            geoid = next((cell for cell in cells if cell.startswith(("14000US42003", "05000US42003"))), None)
            if geoid and (geoid.startswith("05000US") or len(geoid) == len("14000US") + 11):
                logrec_to_geoid[cells[4]] = geoid.split("US", 1)[1]
    rents = {}
    archives = (
        (config.ACS2019_B25064_ZIP_URL, "20195pa0114000_tracts.zip"),
        (config.ACS2019_B25064_COUNTY_ZIP_URL, "20195pa0114000_other_geographies.zip"),
    )
    for url, cache_name in archives:
        archive_path = config.RAW_DIR / cache_name
        cached_download(url, archive_path, refresh=refresh)
        with zipfile.ZipFile(archive_path) as archive:
            name = next(item for item in archive.namelist() if Path(item).name.startswith("e"))
            text = io.TextIOWrapper(archive.open(name), encoding="latin-1", newline="")
            for cells in csv.reader(text):
                geoid = logrec_to_geoid.get(cells[5])
                if not geoid:
                    continue
                value = number_or_none(cells[start - 1])
                if value is not None and value > 0:
                    rents[geoid] = value
    if "42003" not in rents:
        raise RuntimeError("2015-2019 county median gross rent not found")
    print(f"  tracts with a 2015-2019 median gross rent: {len(rents) - 1}", flush=True)
    return rents


def load_tract_matches(refresh):
    """Map each 2020 tract to the 2010 tract whose 2015-2019 rent can stand in for it.

    same_tract: same GEOID and each covers at least 95 percent of the other's land.
    parent_2010_tract: the 2020 tract lies at least 95 percent inside one 2010 tract
    (usually a split). The parent's median describes a larger area.
    """
    print("Census 2020-2010 tract relationship file", flush=True)
    dest = config.RAW_DIR / Path(config.TRACT_RELATIONSHIP_URL).name
    cached_download(config.TRACT_RELATIONSHIP_URL, dest, refresh=refresh)
    same = {}
    parent = {}
    share = config.TRACT_MATCH_MIN_SHARE
    with dest.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter="|"):
            tract20 = row.get("GEOID_TRACT_20") or ""
            tract10 = row.get("GEOID_TRACT_10") or ""
            if not tract20.startswith("42003") or not tract10:
                continue
            part = number_or_none(row.get("AREALAND_PART")) or 0
            land20 = number_or_none(row.get("AREALAND_TRACT_20")) or 0
            land10 = number_or_none(row.get("AREALAND_TRACT_10")) or 0
            if land20 <= 0 or land10 <= 0:
                continue
            if tract20 == tract10 and part / land20 >= share and part / land10 >= share:
                same[tract20] = (tract10, "same_tract")
            elif part / land20 >= share:
                parent[tract20] = (tract10, "parent_2010_tract")
    matches = {**parent, **same}
    print(
        f"  Allegheny tracts comparable to 2010: {len(same)} same tract, "
        f"{len(matches) - len(same)} inside one 2010 tract",
        flush=True,
    )
    return matches


def tract_displacement_inputs(tract, tenure, rent_2019, matches, census_tables):
    """Renter share and rent change vs the county for one 2020 tract. Missing stays None."""
    out = {
        "renter_share": None,
        "median_gross_rent_2019": None,
        "median_gross_rent_2024": None,
        "rent_change": None,
        "rent_change_vs_county": None,
        "rent_2019_geography": None,
    }
    if not tract:
        return out
    if tenure is not None:
        out["renter_share"] = tenure.get(tract)
    rent_24 = None
    county_24 = None
    if census_tables is not None:
        row = census_tables["B25064"].get(f"1400000US{tract}") or {}
        rent_24 = census_missing(row.get("B25064_E001"))
        county_24 = census_missing((census_tables["B25064"].get("0500000US42003") or {}).get("B25064_E001"))
    out["median_gross_rent_2024"] = rent_24
    if rent_2019 is None or matches is None or tract not in matches:
        return out
    tract_2010, relation = matches[tract]
    rent_19 = rent_2019.get(tract_2010)
    county_19 = rent_2019.get("42003")
    out["median_gross_rent_2019"] = rent_19
    if rent_19 and rent_24 and county_19 and county_24:
        out["rent_2019_geography"] = relation if relation == "same_tract" else f"{relation}:{tract_2010}"
        change = rent_24 / rent_19 - 1
        county_change = county_24 / county_19 - 1
        out["rent_change"] = round(change, 3)
        out["rent_change_vs_county"] = round(change - county_change, 3)
    return out


def attach_context(parcels, census_tables, tenure, rent_2019, matches, qct, city, delinquent, condemned, lihtc):
    print("Attaching site flags and tract displacement inputs", flush=True)
    radius = config.NEARBY_AFFORDABLE_METERS
    for record in parcels:
        record.update(
            tract_displacement_inputs(record.get("tract_geoid"), tenure, rent_2019, matches, census_tables)
        )
        record["qct_2026"] = None if qct is None or not record.get("tract_geoid") else record["tract_geoid"] in qct
        record.update(site_flags(record["pin"], record.get("land_use"), city, delinquent, condemned))
        if lihtc is None:
            record["lihtc_projects_800m"] = None
            record["lihtc_units_800m"] = None
            continue
        point = record["geometry"].representative_point()
        px, py = xy(point.x, point.y)
        projects = 0
        units = 0
        for project in lihtc:
            if math.hypot(px - project["x"], py - project["y"]) <= radius:
                projects += 1
                units += int(project.get("li_units") or project.get("units") or 0)
        record["lihtc_projects_800m"] = projects
        record["lihtc_units_800m"] = units


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
    frequent = None
    trips_400 = 0
    stops_800 = 0
    routes = set()
    for stop in stops:
        dist = math.hypot(px - stop["x"], py - stop["y"])
        if nearest is None or dist < nearest[0]:
            nearest = (dist, stop)
        if stop["trips"] >= config.FREQUENT_STOP_MIN_TRIPS and (frequent is None or dist < frequent[0]):
            frequent = (dist, stop)
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
        "frequent_stop_m": None if frequent is None else round(frequent[0]),
        "frequent_stop_name": None if frequent is None else frequent[1]["name"],
        "walk_min_frequent": None if frequent is None else round(frequent[0] / config.WALK_METERS_PER_MINUTE, 1),
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


def _union_features(features):
    parts = []
    for feature in features or []:
        geometry = geojson_to_shape(feature.get("geometry"))
        if geometry is not None and not geometry.is_empty:
            parts.append(geometry)
    if not parts:
        return None
    return shapely.union_all(parts)


def assemble(
    neighborhoods,
    parcel_features,
    assessments,
    zoning_features,
    flood_features,
    slope_features,
    undermined_features,
    block_groups,
    census_tables,
    transit,
    chas_by_tract=None,
):
    print("Joining parcels to neighborhoods and layers", flush=True)
    hood_geoms = [item["geom"] for item in neighborhoods]
    hood_tree = STRtree(hood_geoms)
    zone_shapes = []
    zone_props = []
    for feature in zoning_features or []:
        geometry = geojson_to_shape(feature.get("geometry"))
        if geometry is None:
            continue
        zone_shapes.append(geometry)
        zone_props.append(feature.get("properties") or {})
    zone_tree = STRtree(zone_shapes) if zone_shapes else None

    bg_shapes = [item["geom"] for item in (block_groups or [])]
    bg_tree = STRtree(bg_shapes) if bg_shapes else None

    sfha_parts = []
    shaded_parts = []
    for feature in flood_features or []:
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
    steep = _union_features(slope_features) if slope_features is not None else None
    undermined = _union_features(undermined_features) if undermined_features is not None else None
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
        record["chas_tract_geoid"] = None
        record["chas_rent_burden_share"] = None
        record["chas_low_income_renter_households"] = None
        record["chas_cost_burdened_low_income_renters"] = None
        record["chas_vintage"] = None
        record["tract_geoid"] = None
        if bg_tree is not None:
            bg_hits = bg_tree.query(point, predicate="intersects")
            if len(bg_hits):
                bg_geoid = block_groups[int(bg_hits[0])]["geoid"]
                tract_geoid = bg_geoid[:11]
                record["tract_geoid"] = tract_geoid
                if census_tables is not None:
                    census = _lookup_census(census_tables, bg_geoid)
                    if census:
                        record.update(census)
                if chas_by_tract is not None:
                    record["chas_tract_geoid"] = tract_geoid
                    record["chas_vintage"] = "2018-2022"
                    chas = chas_by_tract.get(tract_geoid)
                    if chas:
                        record.update(chas)

        record["sfha_overlap"] = round(_overlap(geometry, sfha), 3) if flood_features is not None else None
        record["flood_02_overlap"] = round(_overlap(geometry, shaded), 3) if flood_features is not None else None
        record["steep_slope_overlap"] = round(_overlap(geometry, steep), 3) if slope_features is not None else None
        record["undermined_overlap"] = (
            round(_overlap(geometry, undermined), 3) if undermined_features is not None else None
        )
        zones = []
        if record["sfha_overlap"]:
            zones.append("SFHA")
        if record["flood_02_overlap"]:
            zones.append("0.2%")
        record["flood_zones"] = zones
        # A successful download that finds no overlap is a real zero, not a missing layer.
        record["flood_available"] = flood_features is not None
        record["steep_slope_available"] = slope_features is not None
        record["undermined_available"] = undermined_features is not None
        record["transit_available"] = transit is not None
        if transit is not None:
            record.update(_transit_for_point(xy(point.x, point.y), stops))
        else:
            record["trips_within_400m"] = None
            record["nearest_stop_m"] = None
            record["frequent_stop_m"] = None
            record["walk_min_frequent"] = None
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
        "chas_tract_geoid": record.get("chas_tract_geoid"),
        "chas_rent_burden_share": record.get("chas_rent_burden_share"),
        "chas_low_income_renter_households": record.get("chas_low_income_renter_households"),
        "chas_cost_burdened_low_income_renters": record.get("chas_cost_burdened_low_income_renters"),
        "chas_vintage": record.get("chas_vintage"),
        "flood_zones": record.get("flood_zones") or [],
        "sfha_overlap": record.get("sfha_overlap"),
        "flood_02_overlap": record.get("flood_02_overlap"),
        "steep_slope_overlap": record.get("steep_slope_overlap"),
        "undermined_overlap": record.get("undermined_overlap"),
        "trips_within_400m": record.get("trips_within_400m"),
        "stops_within_800m": record.get("stops_within_800m"),
        "nearest_stop_m": record.get("nearest_stop_m"),
        "nearest_stop_name": record.get("nearest_stop_name"),
        "routes_within_400m": record.get("routes_within_400m") or [],
        "frequent_stop_m": record.get("frequent_stop_m"),
        "frequent_stop_name": record.get("frequent_stop_name"),
        "walk_min_frequent": record.get("walk_min_frequent"),
        "tract_geoid": record.get("tract_geoid"),
        "renter_share": record.get("renter_share"),
        "median_gross_rent_2019": record.get("median_gross_rent_2019"),
        "median_gross_rent_2024": record.get("median_gross_rent_2024"),
        "rent_change": record.get("rent_change"),
        "rent_change_vs_county": record.get("rent_change_vs_county"),
        "rent_2019_geography": record.get("rent_2019_geography"),
        "qct_2026": record.get("qct_2026"),
        "vacant_lot": record.get("vacant_lot"),
        "vacant_land_use": record.get("vacant_land_use"),
        "city_owned": record.get("city_owned"),
        "city_inventory": record.get("city_inventory"),
        "city_status": record.get("city_status"),
        "city_open_space": record.get("city_open_space"),
        "tax_delinquent": record.get("tax_delinquent"),
        "tax_delinquent_prior_years": record.get("tax_delinquent_prior_years"),
        "condemned_or_dead_end": record.get("condemned_or_dead_end"),
        "lihtc_projects_800m": record.get("lihtc_projects_800m"),
        "lihtc_units_800m": record.get("lihtc_units_800m"),
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


def _stops_collection(stops):
    features = []
    for stop in stops or []:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [stop["lon"], stop["lat"]]},
                "properties": {
                    "stop_id": stop.get("stop_id"),
                    "name": stop.get("name"),
                    "weekday_trips": int(stop.get("trips") or 0),
                    "routes": stop.get("routes") or [],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def _chas_status(parcels):
    shares = [record.get("chas_rent_burden_share") for record in parcels if record.get("chas_rent_burden_share") is not None]
    tracts = {record.get("chas_tract_geoid") for record in parcels if record.get("chas_tract_geoid")}
    if not shares:
        return (
            "Not loaded. Equity is using ACS income and ACS rent burden only. "
            "The 2018-2022 CHAS tract file was not joined."
        )
    return (
        f"Loaded HUD CHAS 2018-2022 Table 8, census tract summary level 140, Allegheny County. "
        f"{len(shares)} of {len(parcels)} parcels have a tract share "
        f"({len(tracts)} tracts). The measured input is the share of renter households at or below "
        "80% of HAMFI with housing cost burden greater than 30%, among households whose cost burden "
        "was computed. Joined on the 11-digit tract GEOID (the suffix of geoid 1400000US…). "
        "ACS 2024 rent burden stays a separate input. CHAS lags that ACS release by several years."
    )


def _lihtc_collection(projects):
    features = []
    for project in projects or []:
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(project["lon"], 6), round(project["lat"], 6)]},
                "properties": {
                    "hud_id": project.get("hud_id"),
                    "project": project.get("project"),
                    "units": project.get("units"),
                    "li_units": project.get("li_units"),
                    "year_placed_in_service": project.get("year_placed_in_service"),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


SITE_FLAG_KEYS = (
    "vacant_lot",
    "city_owned",
    "city_open_space",
    "tax_delinquent",
    "tax_delinquent_prior_years",
    "condemned_or_dead_end",
    "qct_2026",
)


def _site_summary(parcels):
    by_hood = defaultdict(lambda: defaultdict(int))
    totals = defaultdict(int)
    missing = defaultdict(int)
    for record in parcels:
        for key in SITE_FLAG_KEYS:
            value = record.get(key)
            if value is None:
                missing[key] += 1
            elif value:
                totals[key] += 1
                by_hood[record["neighborhood"]][key] += 1
    return {
        "totals": dict(totals),
        "unknown": dict(missing),
        "by_neighborhood": {name: dict(counts) for name, counts in by_hood.items()},
        "frequent_stop_min_trips": config.FREQUENT_STOP_MIN_TRIPS,
        "walk_meters_per_minute": config.WALK_METERS_PER_MINUTE,
        "nearby_affordable_meters": config.NEARBY_AFFORDABLE_METERS,
        "caveat": (
            "Ownership, vacancy, delinquency, and condemnation records are not availability. "
            "Verify with the Urban Redevelopment Authority, the Pittsburgh Land Bank, or the City before acting."
        ),
    }


def write_outputs(
    neighborhoods, parcels, market, county_income, sources, transit_meta, failures, stops=None, lihtc=None
):
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
        "chas_status": _chas_status(parcels),
        "sites": _site_summary(parcels),
    }
    zoning_review = {
        "needs_expert_review": True,
        "rules_file": "zoning/districts.json",
        "observed_codes": summary["zoning_codes_observed"],
        "unmapped_codes": unmapped,
        "note": "Base districts are filled from Pittsburgh Zoning Code §911.02. allowed is P. variance_or_exception keeps A, S, C, or P/S and the app calls that special approval. Districts with not_in_use_table are not marked prohibited. needs_expert_review stays true.",
    }
    card = model_card()
    files = {
        "parcels.geojson": parcels_fc,
        "neighborhoods.geojson": hood_fc,
        "summary.json": summary,
        "sources.json": sources,
        "score_model.json": card,
        "zoning_review.json": zoning_review,
        "stops.geojson": _stops_collection(stops),
        "lihtc.geojson": _lihtc_collection(lihtc),
    }
    for name, payload in files.items():
        text = json.dumps(payload, separators=(",", ":")) if name.endswith(".geojson") else json.dumps(payload, indent=2)
        for folder in (config.PROCESSED_DIR, config.WEB_DATA_DIR):
            (folder / name).write_text(text + "\n")
    for folder in (config.PROCESSED_DIR, config.WEB_DATA_DIR):
        shutil.copyfile(config.ZONING_RULES_PATH, folder / "zoning.json")
    print(f"Wrote {len(features)} parcels to {config.PROCESSED_DIR} and {config.WEB_DATA_DIR}", flush=True)


def _run_step(sources, failures, name, url, publisher, license_name, notes, func, extra=None):
    try:
        result = func()
        sources.append(_source(name, url, publisher, license_name, "ok", notes, extra))
        return result
    except Exception as error:  # noqa: BLE001 - record the failure, do not invent data
        message = f"{type(error).__name__}: {error}"
        print(f"FAILED {name}: {message}", flush=True)
        failed = dict(extra or {})
        failed["error"] = message
        sources.append(_source(name, url, publisher, license_name, "failed", notes, failed))
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
        "https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries",
        "Allegheny County GIS / WPRDC",
        "License not specified on the county MapServer or on the WPRDC parcel-boundary dataset.",
        "Geometry, PIN, map-block-lot, and calculated acreage for parcels in the neighborhood bounding boxes. Clipped to neighborhood polygons in a later step. No owner fields are on this layer. "
        "The organizers' dataset URL returned HTTP 404 on 2026-09-26. The live WPRDC page is https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries1. Polygons were read from the county MapServer.",
        lambda: download_parcels(neighborhoods, refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Allegheny County Parcel Boundaries",
            "catalog_url": "https://data.wprdc.org/dataset/allegheny-county-parcel-boundaries",
            "caveat": "Geometry and assessment records may update on different schedules; validate parcel IDs.",
            "access_url": config.PARCEL_QUERY_URL,
        },
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
        "Land use, lot area, year built, living area, and sale fields for zips 15201 and 15207. If more than 10 percent of clipped parcels are still unmatched, the pipeline streams the county CSV for those parcel IDs only. Owner names are not in this extract. CHANGENOTICE address fields are never requested or written. Assessed value is not read and is not treated as market value.",
        lambda: download_assessments(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Allegheny County Property Assessments",
            "catalog_url": "https://data.wprdc.org/dataset/property-assessments",
            "caveat": "Assessment fields can be stale or missing; do not treat assessed value as market value.",
            "access_url": config.ASSESSMENT_CSV_URL,
        },
    ) or {}

    zoning_features = _run_step(
        sources,
        failures,
        "City of Pittsburgh zoning districts",
        "https://data.wprdc.org/dataset/pittsburgh-zoning",
        "City of Pittsburgh / WPRDC",
        "License not specified on the WPRDC zoning resource",
        "District code zon_new and the district title. Which housing types are allowed is NOT taken from this layer. That stub lives in zoning/districts.json and needs expert review. "
        "The organizers' dataset URL returned HTTP 404 on 2026-09-26. The live WPRDC page is https://data.wprdc.org/dataset/zoning. Polygons were read from the city feature service.",
        lambda: download_zoning(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Pittsburgh Zoning Districts",
            "catalog_url": "https://data.wprdc.org/dataset/pittsburgh-zoning",
            "caveat": "Map alone is insufficient: overlays, definitions, exceptions, and review rules matter.",
            "access_url": config.ZONING_QUERY_URL,
        },
    )
    flood_features = _run_step(
        sources,
        failures,
        "FEMA National Flood Hazard Layer flood zones",
        "https://www.fema.gov/flood-maps/national-flood-hazard-layer",
        "FEMA",
        "Public domain, U.S. federal work",
        "Effective NFHL layer 28, limited to Special Flood Hazard Areas (SFHA_TF = T) and 0.2-percent zones (ZONE_SUBTY contains 0.2). Zone X minimal-hazard polygons are not downloaded; no overlap with the queried zones is scored as minimal mapped flood hazard. The FEMA HTML page returned HTTP 403 to this client; the MapServer query is the file that was read.",
        lambda: download_flood(neighborhoods, refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "FEMA National Flood Hazard Layer",
            "catalog_url": "https://www.fema.gov/flood-maps/national-flood-hazard-layer",
            "caveat": "Not a substitute for survey or flood determination; map amendments may matter.",
            "access_url": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
        },
    )
    slope_features = _run_step(
        sources,
        failures,
        "Pittsburgh Steep Slopes (25% or greater)",
        "https://data.wprdc.org/dataset/25-or-greater-slope",
        "City of Pittsburgh / WPRDC",
        "License not specified on the WPRDC steep-slope resource",
        "Polygons of slopes 25 percent or greater inside the MVP neighborhood boxes. Overlap is the measured input. The score uses this as a landslide-risk proxy because the organizers' list has no landslide-inventory layer. It is not a landslide map.",
        lambda: download_steep_slopes(neighborhoods, refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Pittsburgh Steep Slopes (25% or greater)",
            "catalog_url": "https://data.wprdc.org/dataset/25-or-greater-slope",
            "caveat": "Derived threshold layer; site engineering requires detailed survey/geotechnical work.",
            "access_url": config.STEEP_SLOPE_QUERY_URL,
            "role": "landslide_risk_proxy",
        },
    )
    undermined_features = _run_step(
        sources,
        failures,
        "Pittsburgh Undermined Areas",
        "https://data.wprdc.org/dataset/undermined-areas",
        "City / County / WPRDC",
        "License not specified on the WPRDC undermined-areas resource",
        "Mine-influence polygons inside the MVP neighborhood boxes. Overlap is a preliminary screen only.",
        lambda: download_undermined(neighborhoods, refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Pittsburgh Undermined Areas",
            "catalog_url": "https://data.wprdc.org/dataset/undermined-areas",
            "caveat": "Historic mine maps can be incomplete or imprecise; never use alone for safety decisions.",
            "access_url": config.UNDERMINED_QUERY_URL,
        },
    )
    census_tables = _run_step(
        sources,
        failures,
        "ACS 2024 5-year tables B19013, B25064, and B25070",
        "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        "U.S. Census Bureau",
        "Public domain",
        "Median household income, median gross rent, and gross rent as a percentage of household income. Filtered to Allegheny County block groups, tracts, and the county summary. "
        + config.CENSUS_API_NOTE,
        lambda: download_census(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "American Community Survey 5-Year",
            "catalog_url": "https://www.census.gov/data/developers/data-sets/acs-5year.html",
            "caveat": "Estimates have margins of error; avoid false precision for small areas.",
            "access_url": config.CENSUS_TABLES["B19013"],
        },
    )
    block_groups = None
    if census_tables is not None:
        block_groups = _run_step(
            sources,
            failures,
            "Census cartographic block groups, Pennsylvania 2024",
            "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
            "U.S. Census Bureau",
            "Public domain",
            "2024 cartographic boundary file cb_2024_42_bg_500k, filtered to Allegheny County, joined to 2024 ACS so the geography vintage matches the statistics. The organizers' list names TIGER/Line; this cartographic file uses the same 2024 GEOIDs and is the file that was joined. NAD83 coordinates are used as WGS84; the difference is small relative to a block group.",
            lambda: load_block_groups(refresh),
            extra={
                "catalog_priority": "Core",
                "catalog_name": "TIGER/Line Shapefiles",
                "catalog_url": "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
                "caveat": "Boundary vintages must match the statistics being joined.",
                "access_url": config.BLOCK_GROUP_ZIP_URL,
            },
        )
    transit = _run_step(
        sources,
        failures,
        "Pittsburgh Regional Transit GTFS",
        "https://data.wprdc.org/dataset/port-authority-of-allegheny-county-transit-data",
        "Pittsburgh Regional Transit / WPRDC",
        "PRT Developer License Agreement, accepted by downloading the public GTFS zip. See https://www.rideprt.org/business-center/developer-resources/",
        "stops.txt, trips.txt, calendar.txt, calendar_dates.txt, routes.txt, and stop_times.txt. Weekday trip counts use one representative weekday inside the feed's service window. "
        "The organizers' dataset URL returned HTTP 404 on 2026-09-26. The schedule actually read is the PRT developer GTFS zip. Trip counts are scheduled service, not realized reliability.",
        lambda: download_transit(neighborhoods, refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Pittsburgh Regional Transit GTFS",
            "catalog_url": "https://data.wprdc.org/dataset/port-authority-of-allegheny-county-transit-data",
            "caveat": "Scheduled service is not the same as realized reliability; agency name may appear historically as Port Authority.",
            "access_url": config.GTFS_URL,
        },
    )
    chas_by_tract = _run_step(
        sources,
        failures,
        "Comprehensive Housing Affordability Strategy (CHAS)",
        config.CHAS_PAGE_URL,
        "U.S. Department of Housing and Urban Development",
        "Public",
        "2018-2022 CHAS (released December 2025), Table 8, census tract summary level 140. "
        "The equity input is the share of renter households at or below 80% of HAMFI with cost burden greater than 30%, "
        "excluding households whose cost burden was not computed. Joined to the parcel on the 11-digit tract GEOID. "
        "ACS 2024 B25070 stays a separate rent-burden input. CHAS lags that ACS vintage by several years. "
        "Column names are from the 2018-2022 data dictionary.",
        lambda: load_chas(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Comprehensive Housing Affordability Strategy (CHAS)",
            "catalog_url": config.CHAS_PAGE_URL,
            "caveat": "Based on multi-year ACS data; releases lag and tables are complex.",
            "access_url": config.CHAS_TRACT_ZIP_URL,
            "dictionary_url": config.CHAS_DICTIONARY_URL,
            "vintage": "2018-2022",
            "summary_level": "140",
            "table": "Table8",
        },
    )

    tenure = _run_step(
        sources,
        failures,
        "ACS 2024 5-year table B25003 (tenure)",
        "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        "U.S. Census Bureau",
        "Public domain",
        "Renter-occupied share of occupied housing units by census tract, for the displacement screen. Same release and table-based summary file format as the other 2024 tables.",
        lambda: download_tenure(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "American Community Survey 5-Year",
            "catalog_url": "https://www.census.gov/data/developers/data-sets/acs-5year.html",
            "caveat": "Estimates have margins of error; avoid false precision for small areas.",
            "access_url": config.CENSUS_TENURE_URL,
            "role": "displacement_screen",
        },
    )
    rent_2019 = _run_step(
        sources,
        failures,
        "ACS 2015-2019 5-year table B25064 (median gross rent)",
        "https://www.census.gov/data/developers/data-sets/acs-5year.html",
        "U.S. Census Bureau",
        "Public domain",
        "Tract and county median gross rent for 2015-2019, the most recent 5-year period that does not overlap 2020-2024. Read from the sequence-based summary file (sequence 0114, position 60, checked against ACS_5yr_Seq_Table_Number_Lookup.txt) because the table-based format starts with 2021. Nominal dollars; the county change is subtracted so region-wide inflation cancels.",
        lambda: load_rent_2019(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "American Community Survey 5-Year",
            "catalog_url": "https://www.census.gov/data/developers/data-sets/acs-5year.html",
            "caveat": "Estimates have margins of error; avoid false precision for small areas.",
            "access_url": config.ACS2019_B25064_ZIP_URL,
            "geography_url": config.ACS2019_GEO_URL,
            "vintage": "2015-2019",
            "role": "displacement_screen",
        },
    )
    tract_matches = _run_step(
        sources,
        failures,
        "Census 2020 to 2010 tract relationship file, Pennsylvania",
        "https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html",
        "U.S. Census Bureau",
        "Public domain",
        "Used only to decide which 2020 tracts can be compared with 2015-2019 ACS rents (2010 tracts). A tract is compared when the 2020 and 2010 tracts share a GEOID and each covers at least 95 percent of the other's land area.",
        lambda: load_tract_matches(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "TIGER/Line Shapefiles",
            "catalog_url": "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
            "caveat": "Boundary vintages must match the statistics being joined.",
            "access_url": config.TRACT_RELATIONSHIP_URL,
        },
    )
    city_owned = _run_step(
        sources,
        failures,
        "City-Owned Properties",
        config.CITY_OWNED_DATASET_URL,
        "City of Pittsburgh / WPRDC",
        "Creative Commons Attribution",
        "Parcel id, land class, inventory type (for example URA Transfer, Public Sale, Greenway), and current status (for example Available for Sale, Hold for Study). Joined on the county parcel id. The owner column is never requested. Greenways and parks are marked so Find Sites can leave them out. City ownership is not availability.",
        lambda: download_city_owned(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "City-Owned Properties",
            "catalog_url": config.CITY_OWNED_DATASET_URL,
            "caveat": "Inventory status changes; confirm availability with the City / URA before acting.",
            "access_url": config.WPRDC_DUMP_URL.format(resource_id=config.CITY_OWNED_RESOURCE_ID),
        },
    )
    tax_delinquent = _run_step(
        sources,
        failures,
        "City of Pittsburgh Property Tax Delinquency",
        config.TAX_DELINQUENCY_DATASET_URL,
        "City of Pittsburgh Department of Finance / WPRDC",
        "Creative Commons Attribution",
        "Parcel id and number of prior delinquent years only. Joined on the county parcel id. Amounts owed and the billing city are not requested. The parcel file keeps two booleans: listed as delinquent, and delinquent for at least one prior year. City real estate tax only; county and school taxes are separate.",
        lambda: download_tax_delinquency(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "City of Pittsburgh Property Tax Delinquency",
            "catalog_url": config.TAX_DELINQUENCY_DATASET_URL,
            "caveat": "Delinquency can be paid or appealed at any time; it is not a sale or availability signal.",
            "access_url": config.WPRDC_DUMP_URL.format(resource_id=config.TAX_DELINQUENCY_RESOURCE_ID),
        },
    )
    condemned = _run_step(
        sources,
        failures,
        "Condemned and Dead-End Properties",
        config.CONDEMNED_DATASET_URL,
        "City of Pittsburgh Department of Permits, Licenses, and Inspections / WPRDC",
        "Creative Commons Attribution",
        "Parcel id, property type, and inspection status. Active records only. The City publishes condemned and dead-end as one category, so the parcel file keeps one boolean. The owner column is never requested.",
        lambda: download_condemned(refresh),
        extra={
            "catalog_priority": "Core",
            "catalog_name": "Condemned and Dead-End Properties",
            "catalog_url": config.CONDEMNED_DATASET_URL,
            "caveat": "A condemned building may be occupied, under repair, or in court; it is not an available site.",
            "access_url": config.WPRDC_DUMP_URL.format(resource_id=config.CONDEMNED_RESOURCE_ID),
        },
    )
    lihtc = _run_step(
        sources,
        failures,
        "HUD Low-Income Housing Tax Credit (LIHTC) properties",
        config.LIHTC_DATASET_URL,
        "U.S. Department of Housing and Urban Development",
        "Public",
        "Project name, total units, low-income units, and year placed in service, within about 2 km of the MVP area. Contact and company fields are not requested. Used as nearby affordable-stock context (projects and low-income units within 800 m). Not a score input.",
        lambda: download_lihtc(neighborhoods, refresh),
        extra={
            "catalog_priority": "Useful",
            "catalog_name": "HUD LIHTC Database",
            "catalog_url": config.LIHTC_DATASET_URL,
            "caveat": "Covers LIHTC only, lags recent placements, and does not show units that left the program.",
            "access_url": config.LIHTC_QUERY_URL,
        },
    )
    qct = _run_step(
        sources,
        failures,
        "HUD Qualified Census Tracts 2026",
        config.QCT_DATASET_URL,
        "U.S. Department of Housing and Urban Development",
        "Public",
        "Allegheny County tract GEOIDs on HUD's QUALIFIED_CENSUS_TRACTS_2026 layer. Joined on the parcel's 2020 tract. A QCT can raise LIHTC eligible basis; that is a financing fact, not a score input. The layer description text still says 2024.",
        lambda: download_qct(refresh),
        extra={
            "catalog_priority": "Useful",
            "catalog_name": "HUD Qualified Census Tracts",
            "catalog_url": config.QCT_DATASET_URL,
            "caveat": "Designations change each year; confirm the year that applies to an allocation.",
            "access_url": config.QCT_QUERY_URL,
        },
    )

    def clip_once():
        return assemble(
            neighborhoods,
            parcel_features,
            assessments,
            zoning_features or [],
            None if flood_features is None else flood_features,
            None if slope_features is None else slope_features,
            None if undermined_features is None else undermined_features,
            block_groups or [],
            census_tables,
            transit,
            chas_by_tract,
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
    attach_context(
        parcels, census_tables, tenure, rent_2019, tract_matches, qct, city_owned, tax_delinquent, condemned, lihtc
    )
    market = _neighborhood_market(parcels)
    county_income = _county_median(census_tables) if census_tables else None
    print("Scoring", flush=True)
    for record in parcels:
        neighborhood_stats = market[record["neighborhood"]]
        record["score"] = score_parcel(record, neighborhood_stats, county_income)
    transit_meta = None if transit is None else {"service_date": transit.get("service_date")}
    sources.extend(
        [
            _source(
                "Allegheny County Property Sale Transactions",
                "https://data.wprdc.org/dataset/allegheny-county-property-sale-transactions",
                "Allegheny County / WPRDC",
                "Public",
                "not_downloaded",
                "Sale prices in this MVP come from sale fields on the property-assessment extract, not from this separate transactions file. The same caveat is applied: only SALECODE 0 / SALEDESC beginning with VALID SALE, price at least $10,000, on or after 2021-09-26. The organizers' URL returned HTTP 404 on 2026-09-26. The live WPRDC page is https://data.wprdc.org/dataset/real-estate-sales.",
                {
                    "catalog_priority": "Core",
                    "catalog_name": "Allegheny County Property Sale Transactions",
                    "catalog_url": "https://data.wprdc.org/dataset/allegheny-county-property-sale-transactions",
                    "caveat": "Filter using sale-validation codes; many nominal transfers are not arm’s-length sales.",
                },
            ),
            _source(
                "OpenStreetMap",
                "https://www.openstreetmap.org/",
                "OpenStreetMap contributors",
                "Open Data Commons Open Database License (ODbL)",
                "used_by_app",
                "Raster tiles are the basemap only (https://tile.openstreetmap.org/{z}/{x}/{y}.png). They are not a scored input.",
                {
                    "catalog_priority": "Useful",
                    "catalog_name": "OpenStreetMap",
                    "catalog_url": "https://www.openstreetmap.org/",
                    "caveat": "Completeness varies; comply with ODbL attribution and share-alike requirements.",
                },
            ),
            _source(
                "EPA EJScreen",
                "https://www.epa.gov/ejscreen/download-ejscreen-data",
                "U.S. EPA",
                "Public",
                "not_in_mvp",
                "Stretch source from the organizers' list. Not joined in this build.",
                {
                    "catalog_priority": "Useful",
                    "catalog_name": "EPA EJScreen",
                    "catalog_url": "https://www.epa.gov/ejscreen/download-ejscreen-data",
                    "caveat": "Screening tool, not a risk assessment; methods and indicator definitions change.",
                },
            ),
            _source(
                "Location Affordability Index",
                "https://hudgis-hud.opendata.arcgis.com/datasets/c1c32742599a42c9a45c95be50ed2ab6_12/about",
                "HUD / DOT",
                "Public",
                "not_in_mvp",
                "Stretch source from the organizers' list. Not joined in this build.",
                {
                    "catalog_priority": "Useful",
                    "catalog_name": "Location Affordability Index",
                    "catalog_url": "https://hudgis-hud.opendata.arcgis.com/datasets/c1c32742599a42c9a45c95be50ed2ab6_12/about",
                    "caveat": "Modeled estimates depend on household profiles and vintage; not observed household spending.",
                },
            ),
            _source(
                "LEHD Origin-Destination Employment Statistics (LODES)",
                "https://lehd.ces.census.gov/data/",
                "U.S. Census Bureau",
                "Public",
                "not_in_mvp",
                "Stretch source from the organizers' list. Not joined in this build. Transit access uses the PRT schedule instead.",
                {
                    "catalog_priority": "Useful",
                    "catalog_name": "LEHD Origin-Destination Employment Statistics (LODES)",
                    "catalog_url": "https://lehd.ces.census.gov/data/",
                    "caveat": "Data are modeled and noise-infused; latest year lags.",
                },
            ),
            _source(
                "Opportunity Atlas",
                "https://www.opportunityatlas.org/",
                "Opportunity Insights / U.S. Census Bureau",
                "Research release",
                "not_in_mvp",
                "Stretch source from the organizers' list. Not joined in this build, and not used to rank people or places as current conditions.",
                {
                    "catalog_priority": "Useful",
                    "catalog_name": "Opportunity Atlas",
                    "catalog_url": "https://www.opportunityatlas.org/",
                    "caveat": "Historical cohort outcomes are not current neighborhood conditions and should not be used to rank people.",
                },
            ),
        ]
    )
    write_outputs(
        neighborhoods,
        parcels,
        market,
        county_income,
        sources,
        transit_meta,
        failures,
        stops=None if transit is None else transit.get("stops"),
        lihtc=lihtc,
    )
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
