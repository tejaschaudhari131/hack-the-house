"""First-pass housing-type scores for one parcel.

Measured inputs stay separate from normative choices (anchors, blends, and
type rules). Scores are 0–100. Null means the inputs were missing, not zero.

Confidence is about thin data. It is not a judgment about whether the
normative weights are the right ones.
"""

from __future__ import annotations

HOUSING_TYPES = (
    "single_family",
    "townhouse_duplex",
    "small_apartment",
    "large_apartment",
)

TYPE_LABELS = {
    "single_family": "Single-family",
    "townhouse_duplex": "Townhouse / duplex",
    "small_apartment": "Small apartment (3–19 units)",
    "large_apartment": "Large apartment (20+ units)",
}

# Value judgments. Changing these changes scores without any new observation.
NORMATIVE = {
    "demand_market_weight": 0.5,
    "demand_lot_fit_weight": 0.5,
    "price_per_sqft_low": 80,
    "price_per_sqft_high": 350,
    "turnover_per_100_low": 5,
    "turnover_per_100_high": 30,
    "min_valid_sales_for_price": 8,
    "transit_walk_weight": 0.45,
    "transit_frequency_weight": 0.55,
    "transit_walk_meters": 800,
    "transit_frequency_saturation_trips": 250,
    "income_need_span": 0.6,
    "equity_need_weight": 0.50,
    "equity_production_weight": 0.35,
    "equity_displacement_weight": 0.25,
    "climate_flood_weight": 0.50,
    "climate_slope_weight": 0.30,
    "climate_undermined_weight": 0.20,
    "sfha_minimum_component": 70,
    "flood_02_component": 40,
    "type_factors": {
        "single_family": {"production": 0.25, "displacement_exposure": 0.25, "climate_exposure": 0.90},
        "townhouse_duplex": {"production": 0.55, "displacement_exposure": 0.40, "climate_exposure": 0.95},
        "small_apartment": {"production": 0.80, "displacement_exposure": 0.55, "climate_exposure": 1.00},
        "large_apartment": {"production": 0.95, "displacement_exposure": 0.85, "climate_exposure": 1.08},
    },
}


def clamp(value, lo=0.0, hi=1.0):
    return max(lo, min(hi, value))


def clamp100(value):
    if value is None:
        return None
    return round(max(0.0, min(100.0, float(value))), 1)


def lot_fit(lot_sqft, housing_type):
    """How well a lot size matches a type. Thresholds are normative, not observed."""
    if lot_sqft is None or lot_sqft <= 0:
        return None
    lot = float(lot_sqft)
    if housing_type == "single_family":
        if lot < 1500:
            return 0.15
        if lot < 4000:
            return 0.15 + 0.85 * (lot - 1500) / 2500
        if lot <= 20000:
            return 1.0
        return 0.75
    if housing_type == "townhouse_duplex":
        if lot < 800:
            return 0.2
        if lot < 1800:
            return 0.2 + 0.8 * (lot - 800) / 1000
        if lot <= 5000:
            return 1.0
        if lot <= 10000:
            return 1.0 - 0.5 * (lot - 5000) / 5000
        return 0.35
    if housing_type == "small_apartment":
        if lot < 2500:
            return 0.15
        if lot < 6000:
            return 0.15 + 0.85 * (lot - 2500) / 3500
        if lot <= 25000:
            return 1.0
        return 0.7
    if housing_type == "large_apartment":
        if lot < 6000:
            return 0.1
        if lot < 15000:
            return 0.1 + 0.9 * (lot - 6000) / 9000
        if lot <= 80000:
            return 1.0
        return 0.8
    raise KeyError(housing_type)


def _anchor(value, low, high):
    if value is None:
        return None
    if high == low:
        return None
    return clamp((float(value) - low) / (high - low))


def market_heat(neighborhood):
    """Blend of observed sale price and turnover, on normative anchors."""
    sales = int(neighborhood.get("valid_sales") or 0)
    price = neighborhood.get("price_per_sqft")
    turnover = neighborhood.get("turnover_per_100")
    price_score = None
    if sales >= NORMATIVE["min_valid_sales_for_price"]:
        price_score = _anchor(
            price, NORMATIVE["price_per_sqft_low"], NORMATIVE["price_per_sqft_high"]
        )
    turnover_score = _anchor(
        turnover, NORMATIVE["turnover_per_100_low"], NORMATIVE["turnover_per_100_high"]
    )
    parts = []
    if price_score is not None:
        parts.append((0.6, price_score))
    if turnover_score is not None:
        parts.append((0.4, turnover_score))
    if not parts:
        return None, price_score, turnover_score
    weight = sum(w for w, _ in parts)
    heat = sum(w * v for w, v in parts) / weight
    return heat, price_score, turnover_score


def transit_score(trips_within_400m, nearest_stop_m, transit_available):
    if not transit_available:
        return None, None, None
    trips = 0 if trips_within_400m is None else float(trips_within_400m)
    if nearest_stop_m is None:
        walk = 0.0
    else:
        walk = clamp(1 - float(nearest_stop_m) / NORMATIVE["transit_walk_meters"])
    import math

    cap = NORMATIVE["transit_frequency_saturation_trips"]
    freq = clamp(math.log1p(trips) / math.log1p(cap))
    score = 100 * (
        NORMATIVE["transit_walk_weight"] * walk + NORMATIVE["transit_frequency_weight"] * freq
    )
    return clamp100(score), round(walk, 3), round(freq, 3)


def need_and_displacement(median_income, county_median_income, rent_burden_share, heat):
    need_income = None
    if median_income is not None and county_median_income:
        ratio = float(median_income) / float(county_median_income)
        need_income = clamp((1 - ratio) / NORMATIVE["income_need_span"])
    need_rent = None if rent_burden_share is None else clamp(float(rent_burden_share))
    parts = []
    if need_income is not None:
        parts.append(need_income)
    if need_rent is not None:
        parts.append(need_rent)
    need = sum(parts) / len(parts) if parts else None
    displacement = heat
    return need, displacement, need_income, need_rent


def equity_score(housing_type, need, displacement):
    if need is None or displacement is None:
        return None
    factors = NORMATIVE["type_factors"][housing_type]
    raw = (
        NORMATIVE["equity_need_weight"] * need
        + NORMATIVE["equity_production_weight"]
        * factors["production"]
        * (0.4 + 0.6 * need)
        - NORMATIVE["equity_displacement_weight"]
        * factors["displacement_exposure"]
        * displacement
    )
    return clamp100(raw * 100)


def _weighted_present(parts):
    """Blend (value, weight) pairs. Missing values are dropped, not treated as zero."""
    numerator = 0.0
    denominator = 0.0
    for value, weight in parts:
        if value is None or weight is None or weight <= 0:
            continue
        numerator += float(weight) * float(value)
        denominator += float(weight)
    if denominator == 0:
        return None
    return numerator / denominator


def climate_components(
    sfha_overlap,
    flood_02_overlap,
    steep_slope_overlap,
    undermined_overlap,
    flood_available,
    steep_slope_available,
    undermined_available,
):
    """Flood is FEMA. Steep slope is a landslide-risk proxy, not a landslide inventory."""
    flood_component = None
    if flood_available:
        sfha = clamp(float(sfha_overlap or 0))
        shaded = clamp(float(flood_02_overlap or 0))
        if sfha > 0:
            flood_component = max(NORMATIVE["sfha_minimum_component"], 100 * sfha)
        elif shaded > 0:
            flood_component = NORMATIVE["flood_02_component"] * max(shaded, 0.35)
        else:
            flood_component = 0.0
    slope_component = None
    if steep_slope_available:
        slope_component = 100 * clamp(float(steep_slope_overlap or 0))
    undermined_component = None
    if undermined_available:
        undermined_component = 100 * clamp(float(undermined_overlap or 0))
    base = _weighted_present(
        [
            (flood_component, NORMATIVE["climate_flood_weight"]),
            (slope_component, NORMATIVE["climate_slope_weight"]),
            (undermined_component, NORMATIVE["climate_undermined_weight"]),
        ]
    )
    return base, flood_component, slope_component, undermined_component


def climate_risk(housing_type, base):
    if base is None:
        return None
    exposure = NORMATIVE["type_factors"][housing_type]["climate_exposure"]
    return clamp100(base * exposure)


def demand_score(housing_type, heat, lot_sqft):
    if heat is None:
        return None, lot_fit(lot_sqft, housing_type)
    fit = lot_fit(lot_sqft, housing_type)
    if fit is None:
        return clamp100(100 * heat), None
    raw = (
        NORMATIVE["demand_market_weight"] * heat
        + NORMATIVE["demand_lot_fit_weight"] * fit
    )
    return clamp100(100 * raw), round(fit, 3)


def confidence_for(parcel, neighborhood, census_note_extra=None):
    """0–1 data-thinness score plus plain-language notes. Not a values score."""
    score = 1.0
    notes = []
    if not parcel.get("assessment_joined"):
        score -= 0.30
        notes.append("No assessment record matched this parcel, so lot size, land use, and sales are missing.")
    if parcel.get("lot_sqft") is None and parcel.get("assessment_joined"):
        score -= 0.10
        notes.append("Lot area is missing, so the lot-fit part of demand is neutral.")
    if parcel.get("median_income") is None:
        score -= 0.20
        notes.append("Census median income is missing here.")
    else:
        moe = parcel.get("income_moe")
        income = parcel.get("median_income")
        if moe is not None and income and float(moe) > 0.4 * float(income):
            score -= 0.10
            notes.append("The Census margin of error on median income is large relative to the estimate.")
    if parcel.get("rent_burden_share") is None:
        score -= 0.15
        notes.append("Census rent-burden data is missing here.")
    if parcel.get("census_geography") == "tract":
        score -= 0.05
        notes.append("Income and rent fell back to the census tract because the block group value was missing.")
    if not parcel.get("transit_available", True):
        score -= 0.20
        notes.append("The transit feed did not load, so there is no transit score.")
    if not parcel.get("flood_available", True):
        score -= 0.15
        notes.append("FEMA flood zones did not load, so flood risk is not in the climate score.")
    if not parcel.get("steep_slope_available", True):
        score -= 0.10
        notes.append(
            "The steep-slope layer did not load, so the landslide-risk proxy is not in the climate score."
        )
    if not parcel.get("undermined_available", True):
        score -= 0.08
        notes.append(
            "Undermined areas did not load, so mine-subsidence screening is not in the climate score."
        )
    sales = int(neighborhood.get("valid_sales") or 0)
    if sales < NORMATIVE["min_valid_sales_for_price"]:
        score -= 0.10
        notes.append(
            "Fewer than 8 valid sales in this neighborhood since the cutoff, so the price signal was not used."
        )
    if census_note_extra:
        notes.append(census_note_extra)
    score = round(clamp(score), 2)
    if score >= 0.75:
        label = "high"
    elif score >= 0.5:
        label = "medium"
    else:
        label = "low"
    return score, label, notes


def score_parcel(parcel, neighborhood, county_median_income):
    heat, price_score, turnover_score = market_heat(neighborhood)
    need, displacement, need_income, need_rent = need_and_displacement(
        parcel.get("median_income"),
        county_median_income,
        parcel.get("rent_burden_share"),
        heat if heat is not None else None,
    )
    # Displacement uses market heat. If heat is missing, equity cannot separate
    # production from displacement, so equity is withheld.
    if heat is None:
        need_for_equity = None
        displacement = None
    else:
        need_for_equity = need

    transit, walk, freq = transit_score(
        parcel.get("trips_within_400m"),
        parcel.get("nearest_stop_m"),
        parcel.get("transit_available", True),
    )
    base, flood_component, slope_component, undermined_component = climate_components(
        parcel.get("sfha_overlap"),
        parcel.get("flood_02_overlap"),
        parcel.get("steep_slope_overlap"),
        parcel.get("undermined_overlap"),
        parcel.get("flood_available", True),
        parcel.get("steep_slope_available", True),
        parcel.get("undermined_available", True),
    )
    conf, conf_label, notes = confidence_for(parcel, neighborhood)
    fits = {}
    scores = {}
    for housing_type in HOUSING_TYPES:
        demand, fit = demand_score(housing_type, heat, parcel.get("lot_sqft"))
        fits[housing_type] = fit
        scores[housing_type] = {
            "demand": demand,
            "transit": transit,
            "equity": equity_score(housing_type, need_for_equity, displacement if heat is not None else None),
            "climate_risk": climate_risk(housing_type, base),
            "confidence": conf,
            "confidence_label": conf_label,
        }
    factors = {
        "market_heat": None if heat is None else round(heat, 3),
        "price_score": None if price_score is None else round(price_score, 3),
        "turnover_score": None if turnover_score is None else round(turnover_score, 3),
        "price_per_sqft": neighborhood.get("price_per_sqft"),
        "turnover_per_100": neighborhood.get("turnover_per_100"),
        "valid_sales": neighborhood.get("valid_sales"),
        "need": None if need is None else round(need, 3),
        "need_income": None if need_income is None else round(need_income, 3),
        "need_rent": None if need_rent is None else round(need_rent, 3),
        "displacement": None if displacement is None else round(displacement, 3),
        "lot_fit": fits,
        "transit_walk": walk,
        "transit_frequency": freq,
        "flood_component": None if flood_component is None else round(flood_component, 1),
        "steep_slope_component": None if slope_component is None else round(slope_component, 1),
        "undermined_component": None if undermined_component is None else round(undermined_component, 1),
        "steep_slope_role": "landslide_risk_proxy",
        "climate_base": None if base is None else round(base, 1),
    }
    return {
        "scores": scores,
        "factors": factors,
        "confidence": conf,
        "confidence_label": conf_label,
        "confidence_notes": notes,
    }


def composite(type_score, weights):
    """Weighted mean. Missing dimensions are left out, not treated as zero.

    weights keys: demand, transit, equity, climate.
    climate is applied to climate suitability (100 - climate_risk).
    """
    suitability = None
    risk = type_score.get("climate_risk")
    if risk is not None:
        suitability = 100 - float(risk)
    parts = [
        (type_score.get("demand"), weights.get("demand", 0)),
        (type_score.get("transit"), weights.get("transit", 0)),
        (type_score.get("equity"), weights.get("equity", 0)),
        (suitability, weights.get("climate", 0)),
    ]
    num = 0.0
    den = 0.0
    for value, weight in parts:
        if value is None or weight is None or weight <= 0:
            continue
        num += float(weight) * float(value)
        den += float(weight)
    if den == 0:
        return None
    return round(num / den, 1)


def rank_types(scores, weights, allowed=None, what_if=False):
    rows = []
    for housing_type in HOUSING_TYPES:
        row = dict(scores[housing_type])
        row["id"] = housing_type
        row["composite"] = composite(row, weights)
        if allowed is None:
            row["allowed"] = None
        else:
            row["allowed"] = housing_type in allowed
        rows.append(row)

    def sort_key(row):
        group = 0
        if not what_if and allowed is not None:
            group = 0 if row["allowed"] else 1
        comp = row["composite"]
        return (group, -(comp if comp is not None else -1))

    rows.sort(key=sort_key)
    return rows


def model_card():
    return {
        "version": 1,
        "scale": "0–100",
        "normalization": (
            "Scores use fixed anchors documented in normative_choices, not a min-max "
            "across parcels. A 90 means 'high on that anchor,' not '90th percentile in the city.'"
        ),
        "housing_types": [
            {"id": key, "label": TYPE_LABELS[key]} for key in HOUSING_TYPES
        ],
        "dimensions": [
            {
                "id": "demand",
                "label": "Demand",
                "higher_means": "Stronger market signal for this type on this lot",
                "measured": [
                    "Neighborhood median sale price per square foot of living area, valid sales only",
                    "Valid sales per 100 parcels since the cutoff",
                    "Parcel lot area",
                ],
                "normative": [
                    "Price anchors of $80 and $350 per square foot",
                    "Turnover anchors of 5 and 30 valid sales per 100 parcels",
                    "Equal blend of market heat and lot-fit",
                    "Lot-size curves that prefer detached homes on larger lots and townhouses on small lots",
                ],
            },
            {
                "id": "transit",
                "label": "Transit access",
                "higher_means": "More weekday transit service within a short walk",
                "measured": [
                    "Weekday scheduled trips at stops within 400 meters",
                    "Distance to the nearest stop",
                ],
                "normative": [
                    "800 meter walk anchor and a frequency cap of 250 weekday trips",
                    "55/45 blend of frequency and proximity",
                    "The same transit score for every housing type. Transit is a property of the place.",
                ],
            },
            {
                "id": "equity",
                "label": "Equity",
                "higher_means": "Stronger case that this type serves lower-income households here, after a displacement penalty",
                "measured": [
                    "Block-group median household income compared with the county median",
                    "Share of renters paying 30 percent or more of income in rent (ACS B25070, not HUD CHAS)",
                    "The same sale prices and turnover used in demand, read here as displacement pressure",
                ],
                "normative": [
                    "Treating income below the county median as need",
                    "Treating hotter sales as displacement pressure",
                    "Type factors that give larger buildings more production value and more displacement exposure",
                ],
            },
            {
                "id": "climate_risk",
                "label": "Climate risk",
                "higher_means": "More hazard exposure. Ranking uses 100 minus this number so higher is a better match.",
                "measured": [
                    "Overlap with FEMA Special Flood Hazard Area and 0.2-percent zones",
                    "Overlap with Pittsburgh steep slopes of 25 percent or greater, used as a landslide-risk proxy, not a landslide inventory",
                    "Overlap with Pittsburgh undermined areas, a preliminary mine-subsidence screen",
                ],
                "normative": [
                    "50/30/20 blend of flood, steep-slope proxy, and undermined area. A missing layer is dropped and the other weights are rescaled.",
                    "A floor of 70 when any Special Flood Hazard Area touches the parcel",
                    "A small exposure multiplier by housing type (more homes, slightly higher risk)",
                ],
            },
        ],
        "composite": (
            "Weighted average of demand, transit, equity, and climate suitability "
            "(100 - climate risk). Weights are the sliders and are value judgments. "
            "Missing dimensions are skipped, not filled with zero."
        ),
        "confidence": (
            "Confidence falls when assessment, census, transit, or hazard data is missing "
            "or thin. It does not say whether the value judgments are good ones."
        ),
        "normative_choices": NORMATIVE,
        "default_weights": {"demand": 25, "transit": 25, "equity": 25, "climate": 25},
    }
