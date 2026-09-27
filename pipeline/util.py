"""Small HTTP and geometry helpers for the pipeline."""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request

import shapely
from shapely.geometry import shape as shapely_shape

USER_AGENT = "hack-the-house/0.1 (AI for Housing hackathon; educational prototype)"


def fetch_bytes(url, timeout=180, retries=3):
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except Exception as error:  # noqa: BLE001 - retry network failures
            last_error = error
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"GET failed for {url}: {last_error}") from last_error


def fetch_json(url, params=None, timeout=180):
    raw = None
    if params:
        query = urllib.parse.urlencode(params)
        # ArcGIS/IIS rejects long GET query strings (large object-ID batches).
        # A form POST is the same read-only query, with no URL length limit.
        if len(query) > 1600 and url.endswith('/query'):
            request = urllib.request.Request(url, data=query.encode(), headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
        else:
            url = url + ("&" if "?" in url else "?") + query
    if raw is None:
        raw = fetch_bytes(url, timeout=timeout)
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Expected JSON from {url[:160]} but got: {raw[:180]!r}") from error


def download_file(url, dest, timeout=300):
    dest.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response, dest.open("wb") as handle:
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    return dest


def cached_download(url, dest, refresh=False):
    if dest.exists() and dest.stat().st_size > 0 and not refresh:
        return dest
    return download_file(url, dest)


def arcgis_features(query_url, extra_params, page_size=1000, order_by="OBJECTID"):
    """Page an ArcGIS query that returns GeoJSON."""
    offset = 0
    pages = 0
    while True:
        params = {
            "where": "1=1",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page_size,
        }
        if order_by:
            params["orderByFields"] = order_by
        params.update(extra_params)
        if not params.get("orderByFields"):
            params.pop("orderByFields", None)
        payload = fetch_json(query_url, params, timeout=180)
        if payload.get("error"):
            raise RuntimeError(f"ArcGIS error from {query_url}: {payload['error']}")
        features = payload.get("features") or []
        pages += 1
        print(f"  page {pages}: {len(features)} features (offset {offset})", flush=True)
        for feature in features:
            yield feature
        if len(features) < page_size:
            break
        offset += len(features)
        if pages > 80:
            raise RuntimeError(f"ArcGIS paging ran too long for {query_url}")


def as_polygonal(geometry):
    if geometry is None or geometry.is_empty:
        return None
    if not geometry.is_valid:
        geometry = shapely.make_valid(geometry)
    if geometry.geom_type in ("Polygon", "MultiPolygon"):
        return geometry
    if geometry.geom_type == "GeometryCollection":
        parts = [part for part in geometry.geoms if part.geom_type in ("Polygon", "MultiPolygon")]
        if not parts:
            return None
        return shapely.union_all(parts)
    return None


def geojson_to_shape(geometry):
    if not geometry:
        return None
    try:
        return as_polygonal(shapely_shape(geometry))
    except Exception:
        return None


def shape_to_geojson(geometry, decimals=6):
    mapped = shapely.geometry.mapping(geometry)

    def round_coords(coords):
        if isinstance(coords, (list, tuple)):
            if coords and isinstance(coords[0], (int, float)):
                return [round(float(coords[0]), decimals), round(float(coords[1]), decimals)]
            return [round_coords(item) for item in coords]
        raise TypeError(type(coords))

    return {"type": mapped["type"], "coordinates": round_coords(mapped["coordinates"])}


def envelope(geometry, pad=0.0):
    minx, miny, maxx, maxy = geometry.bounds
    return (minx - pad, miny - pad, maxx + pad, maxy + pad)


def esri_envelope(bounds):
    minx, miny, maxx, maxy = bounds
    return f"{minx},{miny},{maxx},{maxy}"
