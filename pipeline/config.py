"""MVP area and public endpoints. Tejas owns this pipeline."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / "pipeline" / "data" / "raw"
PROCESSED_DIR = REPO_ROOT / "pipeline" / "data" / "processed"
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
ZONING_RULES_PATH = REPO_ROOT / "zoning" / "districts.json"

# Official city neighborhoods. "Lawrenceville" is three neighborhoods.
MVP_NEIGHBORHOODS = (
    {"name": "Hazelwood", "group": "Hazelwood"},
    {"name": "Lower Lawrenceville", "group": "Lawrenceville"},
    {"name": "Central Lawrenceville", "group": "Lawrenceville"},
    {"name": "Upper Lawrenceville", "group": "Lawrenceville"},
)

WHY_THESE_PLACES = (
    "Hazelwood and Lawrenceville are the two places the scores can actually separate. "
    "In this pull, slopes of 25 percent or greater (a landslide-risk proxy, not a landslide "
    "inventory) touch about 57 percent of Hazelwood parcels and about 15 percent of "
    "Lawrenceville parcels. Mapped undermined areas show up in Hazelwood (about 13 percent "
    "of parcels) and not in these Lawrenceville parcels. Mapped FEMA flood zones run the "
    "other way: about 6 percent of Lawrenceville parcels and under 1 percent of Hazelwood "
    "parcels. Incomes are lower in Hazelwood. Lawrenceville (Lower, Central, and Upper) has "
    "frequent bus service and higher sale prices, which is the displacement pressure the "
    "equity score is meant to show. Glen Hazel is left out on purpose: it is its own "
    "neighborhood, not part of the Hazelwood boundary."
)

# Fixed window so a Sunday rerun does not silently change the sales sample.
SALE_CUTOFF_ISO = "2021-09-26"

NEIGHBORHOODS_URL = (
    "https://data.wprdc.org/dataset/e672f13d-71c4-4a66-8f38-710e75ed80a4/"
    "resource/4af8e160-57e9-4ebf-a501-76ca1b42fc99/download/neighborhoods.geojson"
)
PARCEL_QUERY_URL = (
    "https://gisdata.alleghenycounty.us/arcgis/rest/services/OPENDATA/Parcels/MapServer/0/query"
)
ASSESSMENT_SEARCH_URL = "https://data.wprdc.org/api/3/action/datastore_search"
ASSESSMENT_RESOURCE_ID = "9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5"
ASSESSMENT_CSV_URL = (
    "https://data.wprdc.org/dataset/2b3df818-601e-4f06-b150-643557229491/"
    "resource/9a1c60bd-f9f7-4aba-aeb7-af8c3aaa44e5/download/assessments.csv"
)
# Zips that cover the MVP neighborhoods. The spatial clip is what defines the area.
# A CSV fallback fills parcel IDs these zips miss.
ASSESSMENT_ZIPS = (15201, 15207)

ZONING_QUERY_URL = (
    "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/"
    "PGHWebZoning/FeatureServer/0/query"
)
# Organizers' list has no landslide-inventory layer. This is the steep-slope proxy.
STEEP_SLOPE_QUERY_URL = (
    "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/"
    "PGHWebSlope25/FeatureServer/0/query"
)
UNDERMINED_QUERY_URL = (
    "https://services1.arcgis.com/YZCmUqbcsUpOKfj7/arcgis/rest/services/"
    "PGHWebUndermined/FeatureServer/0/query"
)
FLOOD_QUERY_URL = (
    "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
)
GTFS_URL = "https://www.rideprt.org/developerresources/GTFS.zip"
CENSUS_TABLES = {
    "B19013": "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b19013.dat",
    "B25070": "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25070.dat",
    "B25064": "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25064.dat",
}
BLOCK_GROUP_ZIP_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_42_bg_500k.zip"
# 2018-2022 CHAS, Census tract summary level 140. The download tool on cp.html
# builds this path as cp/{year}-{geo}-{ftype}.zip. Released December 2025.
CHAS_PAGE_URL = "https://www.huduser.gov/portal/datasets/cp.html"
CHAS_TRACT_ZIP_URL = "https://www.huduser.gov/portal/datasets/cp/2018thru2022-140-csv.zip"
CHAS_DICTIONARY_URL = "https://www.huduser.gov/portal/datasets/cp/CHAS-data-dictionary-18-22.xlsx"

# Census API was checked on 2026-09-26. Unauthenticated calls redirect to missing_key.html.
CENSUS_API_NOTE = (
    "https://api.census.gov/data/2024/acs/acs5 rejected unauthenticated requests "
    "(X-DataWebAPI-KeyError, redirect to missing_key.html) on 2026-09-26. "
    "The pipeline reads the Census Bureau's public 2024 ACS 5-year table-based summary files instead."
)

ASSESSMENT_FIELDS = (
    "PARID,PROPERTYHOUSENUM,PROPERTYADDRESS,PROPERTYUNIT,PROPERTYCITY,PROPERTYZIP,"
    "CLASS,CLASSDESC,USECODE,USEDESC,LOTAREA,YEARBLT,FINISHEDLIVINGAREA,"
    "SALEDATE,SALEPRICE,SALECODE,SALEDESC"
)

# Person-level fields exist on the county roll (OWNERNAME, CHANGENOTICEADDRESS*,
# and deed-party names on the separate sales file). Never request or write them.
FORBIDDEN_OUTPUT_FRAGMENTS = (
    "owner",
    "changenotice",
    "mailing",
    "buyer",
    "seller",
    "grantor",
    "grantee",
)
