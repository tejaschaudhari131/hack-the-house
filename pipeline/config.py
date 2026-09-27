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

# Tenure for the displacement screen, same 2024 5-year release as the tables above.
CENSUS_TENURE_URL = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/acsdt5y2024-b25003.dat"
)
# 2015-2019 ACS 5-year does not overlap 2020-2024, so the rent change compares two
# independent samples. That release only exists in the older sequence-file format.
# B25064 (median gross rent) is sequence 0114, start position 60, per
# ACS_5yr_Seq_Table_Number_Lookup.txt.
ACS2019_SEQ_LOOKUP_URL = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2019/documentation/user_tools/"
    "ACS_5yr_Seq_Table_Number_Lookup.txt"
)
ACS2019_B25064_ZIP_URL = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2019/data/5_year_seq_by_state/"
    "Pennsylvania/Tracts_Block_Groups_Only/20195pa0114000.zip"
)
# The county row is only in the "all other geographies" archive for the same sequence.
ACS2019_B25064_COUNTY_ZIP_URL = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2019/data/5_year_seq_by_state/"
    "Pennsylvania/All_Geographies_Not_Tracts_Block_Groups/20195pa0114000.zip"
)
ACS2019_B25064_SEQUENCE = "0114"
ACS2019_B25064_START_POSITION = 60
ACS2019_GEO_URL = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2019/data/5_year_seq_by_state/"
    "Pennsylvania/Tracts_Block_Groups_Only/g20195pa.csv"
)
# 2015-2019 uses 2010 tracts. Only tracts whose 2020 and 2010 land areas overlap by
# at least this share in both directions are compared.
TRACT_RELATIONSHIP_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st42.txt"
)
TRACT_MATCH_MIN_SHARE = 0.95

# Site inventory layers from the organizers' WPRDC list. Joined on the 16-character
# county parcel id. Owner fields exist on two of these resources and are never requested.
WPRDC_DUMP_URL = "https://data.wprdc.org/datastore/dump/{resource_id}"
CITY_OWNED_DATASET_URL = "https://data.wprdc.org/dataset/city-owned-properties"
CITY_OWNED_RESOURCE_ID = "e1dcee82-9179-4306-8167-5891915b62a7"
CITY_OWNED_FIELDS = "pin,class,inventory_type,current_status,last_updated"
TAX_DELINQUENCY_DATASET_URL = "https://data.wprdc.org/dataset/city-of-pittsburgh-property-tax-delinquency"
TAX_DELINQUENCY_RESOURCE_ID = "ed0d1550-c300-4114-865c-82dc7c23235b"
TAX_DELINQUENCY_FIELDS = "pin,prior_years"
CONDEMNED_DATASET_URL = "https://data.wprdc.org/dataset/condemned-properties"
CONDEMNED_RESOURCE_ID = "0a963f26-eb4b-4325-bbbc-3ddf6a871410"
CONDEMNED_FIELDS = "parcel_id,property_type,inspection_status"

# HUD eGIS. LIHTC contact and company fields are never requested.
LIHTC_DATASET_URL = "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::low-income-housing-tax-credit-properties"
LIHTC_QUERY_URL = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/LIHTC/FeatureServer/0/query"
LIHTC_FIELDS = "HUD_ID,PROJECT,N_UNITS,LI_UNITS,YR_PIS,NON_PROF"
QCT_DATASET_URL = "https://www.huduser.gov/portal/datasets/qct.html"
QCT_QUERY_URL = (
    "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0/query"
)

# A stop with at least this many scheduled weekday trips averages one every 15 minutes
# over a 15-hour day. Walk time is straight-line distance at 80 m per minute; real
# street routes are longer.
FREQUENT_STOP_MIN_TRIPS = 60
WALK_METERS_PER_MINUTE = 80
NEARBY_AFFORDABLE_METERS = 800

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
    "billing",
)
