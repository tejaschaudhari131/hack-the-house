"""Site inventory flags for the Find Sites view.

Each WPRDC layer is reduced to booleans and program categories keyed by the
16-character county parcel id. Owner names, billing addresses, and dollar
amounts owed are not read. A flag says a public record exists. It does not
say a parcel is available, for sale, or buildable.
"""

from __future__ import annotations

OPEN_SPACE_INVENTORY = {"greenway", "legislated greenway", "potential greenway", "park"}

# The City's own labels, lowercased. Codes are short so the app can filter on them.
CITY_STATUS_CODES = {
    "available for sale": "available",
    "sale pending": "sale_pending",
    "acquisition pending": "acquisition_pending",
    "hold for study": "hold_for_study",
    "permanent city ownership": "permanent",
}

CITY_INVENTORY_LABELS = {
    "hold for study": "Hold for Study",
    "ura transfer": "URA Transfer",
    "plb transfer": "PLB Transfer",
    "public sale": "Public Sale",
    "cdc property reserve": "CDC Property Reserve",
    "greenway": "Greenway",
    "legislated greenway": "Legislated Greenway",
    "potential greenway": "Potential Greenway",
    "park": "Park",
}


def normalize_pin(value):
    text = str(value or "").strip().upper()
    return text or None


def is_vacant_land_use(use_desc):
    """County land-use descriptions such as VACANT LAND or VACANT COMMERCIAL LAND."""
    text = str(use_desc or "").upper()
    return "VACANT" in text and "LAND" in text


def _number(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def parse_city_owned(rows):
    """City-Owned Properties. One entry per parcel id."""
    out = {}
    for row in rows:
        pin = normalize_pin(row.get("pin"))
        if not pin:
            continue
        inventory_raw = str(row.get("inventory_type") or "").strip()
        inventory_key = inventory_raw.lower()
        status_key = str(row.get("current_status") or "").strip().lower()
        land_class = str(row.get("class") or "").strip().lower()
        entry = {
            "city_owned": True,
            "city_inventory": CITY_INVENTORY_LABELS.get(inventory_key, inventory_raw or "Unknown"),
            "city_status": CITY_STATUS_CODES.get(status_key, "unknown"),
            "city_open_space": inventory_key in OPEN_SPACE_INVENTORY,
            "city_vacant_land": land_class == "vacant land",
        }
        previous = out.get(pin)
        if previous:
            # Duplicate rows: keep the more cautious reading.
            entry["city_open_space"] = entry["city_open_space"] or previous["city_open_space"]
            entry["city_vacant_land"] = entry["city_vacant_land"] or previous["city_vacant_land"]
            if previous["city_status"] != "available":
                entry["city_status"] = previous["city_status"]
        out[pin] = entry
    return out


def parse_tax_delinquency(rows):
    """City of Pittsburgh real estate tax delinquency. Presence plus a prior-year flag."""
    out = {}
    for row in rows:
        pin = normalize_pin(row.get("pin"))
        if not pin:
            continue
        prior = _number(row.get("prior_years")) or 0
        previous = out.get(pin, {})
        out[pin] = {
            "tax_delinquent": True,
            "tax_delinquent_prior_years": bool(prior > 0 or previous.get("tax_delinquent_prior_years")),
        }
    return out


def parse_condemned(rows):
    """Condemned and Dead-End Properties. The City publishes one combined category."""
    out = set()
    for row in rows:
        pin = normalize_pin(row.get("parcel_id"))
        if not pin:
            continue
        status = str(row.get("inspection_status") or "").strip().lower()
        if status and status != "active":
            continue
        out.add(pin)
    return out


def site_flags(pin, land_use, city, delinquent, condemned):
    """Merge the layers for one parcel. Missing layers stay None, not False."""
    pin = normalize_pin(pin)
    flags = {
        "vacant_land_use": is_vacant_land_use(land_use) if land_use else None,
        "city_owned": None,
        "city_inventory": None,
        "city_status": None,
        "city_open_space": None,
        "tax_delinquent": None,
        "tax_delinquent_prior_years": None,
        "condemned_or_dead_end": None,
    }
    if city is not None:
        entry = city.get(pin)
        flags["city_owned"] = bool(entry)
        if entry:
            flags["city_inventory"] = entry["city_inventory"]
            flags["city_status"] = entry["city_status"]
            flags["city_open_space"] = entry["city_open_space"]
        else:
            flags["city_open_space"] = False
    if delinquent is not None:
        entry = delinquent.get(pin)
        flags["tax_delinquent"] = bool(entry)
        flags["tax_delinquent_prior_years"] = bool(entry and entry["tax_delinquent_prior_years"])
    if condemned is not None:
        flags["condemned_or_dead_end"] = pin in condemned
    city_vacant = bool(city and city.get(pin, {}).get("city_vacant_land"))
    if flags["vacant_land_use"] is None and not city_vacant:
        flags["vacant_lot"] = None
    else:
        flags["vacant_lot"] = bool(flags["vacant_land_use"]) or city_vacant
    return flags
