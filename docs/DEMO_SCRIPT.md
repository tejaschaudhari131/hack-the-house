# Demo script (about 4 minutes)

Recorded against production, https://hack-the-house.vercel.app, at commit `8ff2989` data (pulled 2026-09-26/27) with default weights. The guided example resolves its parcel from the data at runtime (`web/lib/guide.js`); with this data it is **PIN 0056F00338000000** (Hazelwood Ave, Hazelwood; no house number in the county record). If the numbers on screen differ, the data or weights changed; say what is on screen, not what is written here.

Captions in the recording are on-screen text overlays. There is no voice track; the narration below is for a live presenter.

| Time | Screen and clicks | Narration (word for word) |
| --- | --- | --- |
| 0:00–0:25 | Open the site. The three-step intro appears. Read step 1, then close it. | "This is Hack the House, our entry for AI Horizons 2026, Challenge 3. The question a CDC or planner brings is: which real parcel and housing option should we investigate next, why does it rank the way it does, and what do we have to verify before acting? It covers 8,645 parcels in Hazelwood and Lawrenceville and it is decision support, not a permit or a feasibility study." |
| 0:25–1:00 | Click **Try a real example**. Step 1 opens Find Sites with the question applied. Point at the match count and the top result. | "We start from a concrete question: City-owned vacant lots where a triplex is allowed by right, outside mapped flood zones, within a ten-minute straight-line walk of frequent transit. Twenty-five parcels match. The top one under balanced weights is this 5,100-square-foot City-inventory lot on Hazelwood Avenue, zoned LNC. A City record is not availability; that goes on our list to verify." |
| 1:00–1:50 | Click **Compare two housing options on this parcel**. Show the two scenario cards and the contribution table. | "Now we compare two housing forms on the same lot: a three-unit triplex, read from the Three-Unit row of the zoning use table, and a townhouse or duplex. Both are permitted by right, and permission is shown separately from the score. Under balanced weights they are close: 72.9 for the townhouse, 72.6 for the triplex. The table shows why: market activity and lot fit add two points for the townhouse; equity adds 1.2 and the carbon-related proxy half a point for the triplex. Transit and displacement are the same place, so they are held constant." |
| 1:50–2:25 | Open **Evidence behind each factor** and expand one factor. | "Every factor has its evidence: the source and vintage, the geography, what was observed, the assumptions that turn it into a score, what is missing, and the source's own limits. Here the market factor uses valid county sales since 2021 and an assumed lot-fit curve; it is not a measure of demand for a triplex." |
| 2:25–3:05 | Under Weights, click **Housing-need emphasis**. Then open the one-factor sweep. | "Priorities are value judgments, so we make them visible. Switching to the housing-need emphasis puts the triplex ahead, 71.5 to 69.5. The sweep says exactly where that happens: with the other weights fixed, the two scores are equal when the equity weight reaches 30.85; stepping by one first changes the displayed result at 31. Transit and displacement cannot reorder options on one parcel." |
| 3:05–3:35 | Click **Explain A vs B**. The explanation box shows **Template explanation (no AI)** with its notice. | "The explanation is grounded in these computed numbers. On this deployment no language-model key is configured, so it shows the labeled template written from the same facts; when a key is added, an AI summary appears with its own label, and the scores do not change." |
| 3:35–4:00 | Click **Next: the decision brief**; show the brief (print preview or the brief page). Return to the map. | "Finally, the decision brief: both scenarios, permission, contributions, the priorities tested, what is not evaluated, the sources, and three next steps from fixed rules: confirm the zoning and dimensional rules with City Planning, verify control with the City, the URA, or the Land Bank, and get a hazard review for the mapped steep-slope overlap. Next, we want a two-week pilot with one CDC and a qualified zoning reviewer." |

## Click sequence (for re-recording)

1. Load `/` in a fresh browser (onboarding shows). Close it or press **Try a real example** inside it.
2. Guided step 1 (Find Sites): wait for the banner "25 parcels match…".
3. **Compare two housing options on this parcel →** (drop mode; scenario A triplex, B townhouse/duplex, same PIN).
4. Scroll the panel to the contribution table, then to **Evidence behind each factor**; expand **Market activity & lot fit**.
5. Scroll to **Weights**; click **Housing-need emphasis**; scroll back to the comparison; open **One-factor sweep**.
6. Click **Explain A vs B**; wait for the label.
7. **Next: the decision brief →**, then **Print decision brief** (or show the step-3 banner).

## Resolved facts used above (from the committed data, default weights)

- Shortlist: example `city-triplex`, 25 matches; top match PIN 0056F00338000000, Hazelwood, LNC, 5,100 sq ft vacant land, City status "available" (a record, not availability), 8% steep-slope overlap, 1.6 min straight-line to the SECOND AVE + FLOWERS AVE frequent stop.
- Balanced: triplex 72.6, townhouse/duplex 72.9 (close). Housing-need emphasis: triplex 71.5, townhouse 69.5. Five priorities: townhouse first under Balanced and Transit; triplex first under Housing-need, Lower-hazard, Lower-carbon.
- Sweep at balanced weights: equity equal at 30.85 (sampled change at 31), demand 21.35, carbon 23.84, climate no crossing, transit and displacement cannot reorder.
- Brief next steps: confirm §911.02 and dimensional rules with City Planning; verify control and availability with the City, the URA, or the Pittsburgh Land Bank; hazard review for the 25%+ slope overlap.
