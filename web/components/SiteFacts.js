"use client"

import { CITY_STATUS_LABELS, HIGH_DISPLACEMENT, SITE_CAVEAT, placeDisplacement } from "../lib/sites.js"

function yesNo(value, yes, no) {
  if (value === null || value === undefined) return "not known (layer or record missing)"
  return value ? yes : no
}

function pct(value) {
  if (value === null || value === undefined) return "n/a"
  return `${Math.round(Number(value) * 100)}%`
}

function signedPoints(value) {
  if (value === null || value === undefined) return null
  const points = Math.round(Number(value) * 100)
  return `${points >= 0 ? "+" : ""}${points} points`
}

/** Public-record flags, transit walk, displacement inputs, and nearby LIHTC for one parcel. */
export default function SiteFacts({ props, compact = false }) {
  if (!props) return null
  const displacement = placeDisplacement(props)
  const cityLine = props.city_owned
    ? `Yes: ${props.city_inventory || "inventory type not given"}, ${CITY_STATUS_LABELS[props.city_status] || "status unknown"}${props.city_open_space ? " (greenway or park, not a housing site)" : ""}`
    : yesNo(props.city_owned, "Yes", "No")
  return (
    <div className="site-facts">
      <h3>Site records</h3>
      <p className="hint">{SITE_CAVEAT}</p>
      <ul>
        <li>
          <strong>Vacant land:</strong> {yesNo(props.vacant_lot, "Yes", "No")}
          {props.land_use ? ` (county land use: ${props.land_use})` : ""}
        </li>
        <li>
          <strong>City-owned:</strong> {cityLine}
        </li>
        <li>
          <strong>City tax delinquent:</strong>{" "}
          {yesNo(
            props.tax_delinquent,
            props.tax_delinquent_prior_years ? "Yes, including a prior year" : "Yes, current year only",
            "No",
          )}
        </li>
        <li>
          <strong>Condemned or dead-end (one City category):</strong> {yesNo(props.condemned_or_dead_end, "Yes", "No")}
        </li>
        <li>
          <strong>HUD Qualified Census Tract 2026:</strong> {yesNo(props.qct_2026, "Yes", "No")}
          {props.qct_2026 ? " (can raise LIHTC eligible basis; a financing fact, not a score input)" : ""}
        </li>
        <li>
          <strong>Frequent transit:</strong>{" "}
          {props.walk_min_frequent === null || props.walk_min_frequent === undefined
            ? "no stop with 60+ weekday trips nearby"
            : `about ${Math.round(props.walk_min_frequent)} min straight-line walk to ${props.frequent_stop_name || "a stop"} (60+ weekday trips). Real routes are longer.`}
        </li>
        {!compact ? (
          <li>
            <strong>LIHTC nearby:</strong>{" "}
            {props.lihtc_projects_800m === null || props.lihtc_projects_800m === undefined
              ? "not loaded"
              : `${props.lihtc_projects_800m} project${props.lihtc_projects_800m === 1 ? "" : "s"}, about ${Number(props.lihtc_units_800m || 0).toLocaleString()} low-income units within 800 m (HUD LIHTC database; context only)`}
          </li>
        ) : null}
      </ul>
      <h3>Displacement risk (screening signal)</h3>
      <p>
        <strong>{displacement === null ? "n/a" : displacement}</strong>
        {displacement !== null ? (displacement >= HIGH_DISPLACEMENT ? " · high for this screen" : " · below the high mark of 60") : ""}
        {props.tract_geoid ? ` · census tract ${props.tract_geoid}` : ""}
      </p>
      {!compact ? (
        <ul className="hint">
          <li>Renters: {pct(props.renter_share)} of occupied homes (ACS 2020–2024, B25003).</li>
          <li>
            Low-income renters paying more than 30% of income: {pct(props.chas_rent_burden_share)} (HUD CHAS 2018–2022).
          </li>
          <li>
            Median gross rent: {props.median_gross_rent_2019 ? `$${props.median_gross_rent_2019.toLocaleString()}` : "n/a"} (2015–2019) to{" "}
            {props.median_gross_rent_2024 ? `$${props.median_gross_rent_2024.toLocaleString()}` : "n/a"} (2020–2024)
            {signedPoints(props.rent_change_vs_county) ? `, ${signedPoints(props.rent_change_vs_county)} versus the county's change` : ""}
            {String(props.rent_2019_geography || "").startsWith("parent") ? ". The 2015–2019 figure is the larger 2010 tract this one was split from." : "."}
          </li>
          <li>A screening signal from public tables, not a prediction that anyone will be displaced.</li>
        </ul>
      ) : null}
    </div>
  )
}
