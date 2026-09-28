# Playhouse

Pittsburgh Planning Studio

by Hack the House

# Demo script (about 4 minutes)

Recorded against production, https://playhouse-pittsburgh.vercel.app, at commit `8ff2989` data (pulled 2026-09-26/27) with default weights. The guided example resolves its parcel from the data at runtime (`web/lib/guide.js`); with this data it is **PIN 0056F00338000000** (Hazelwood Ave, Hazelwood; no house number in the county record). If the numbers on screen differ, the data or weights changed; say what is on screen, not what is written here.

Captions in the recording are on-screen text overlays. There is no voice track; the narration below is for a live presenter.

The app is organized as three steps in the header (1 Find sites, 2 Compare options, 3 Get the brief), with **Start guided example** as the main button, a next-step bar under the header, and details behind "How was this scored?" and "Where the numbers come from".

| Time | Screen and clicks | Narration (word for word) |
| --- | --- | --- |
| 0:00–0:25 | Open the site. Read intro screen 1, click **Next** to show the three steps, then close it. The header shows the three steps. | "This is Playhouse, our entry for AI Horizons 2026, Challenge 3. A CDC or planner asks: which real lot and which kind of housing should we look at next, why does it rank that way, and what do we have to check before acting? It covers 8,645 lots in Hazelwood and Lawrenceville, in three steps: find sites, compare options, get the brief. It is decision support, not a permit." |
| 0:25–1:00 | Click **Start guided example**. Step 1 (Find sites) applies the question; point at the match count and the top lot. | "Step one starts from a real question: City-owned vacant lots where a triplex is allowed by right, outside mapped flood zones, near frequent transit. Twenty-five lots match. The top one is this 5,100-square-foot City-inventory lot on Hazelwood Avenue. A City record is not the same as available; that goes on our list to check." |
| 1:00–1:45 | Click **Compare two housing options on this parcel**. Step 2 shows the answer card. | "Step two compares two kinds of housing on that lot: a three-unit triplex and a townhouse or duplex. The answer comes first: the townhouse scores slightly higher, 72.9 to 72.6, mostly because of market activity and lot fit, while the triplex does better on housing need. Both are allowed by right under the city's use table, and that is shown separately from the score." |
| 1:45–2:20 | Open **How was this scored?** and show the points table; then open **Where the numbers come from** and expand one factor. | "Every number is one click away. Here are the points each factor adds; transit and displacement are the same for both options on one lot. And here is the evidence: source and year, what was observed, the assumptions, and what is missing." |
| 2:20–3:00 | Under **What matters most to you?**, click **Housing-need emphasis**. Point at the "Ranking changed" line and the new answer; open the one-factor sweep in the details. | "Priorities are a choice, so the app makes them visible. With housing need weighted more, the ranking changes: the triplex now leads, 71.5 to 69.5. The sweep shows exactly where the two options tie, so a flip is a values question, not a data finding." |
| 3:00–3:30 | Click **Explain the difference in plain words**. The box shows **Template explanation (no AI)**. | "The plain-words explanation is built from the same numbers. On this deployment no language-model key is set up, so it shows the labeled template; with a key, an AI summary appears with its own label and the scores do not change." |
| 3:30–4:00 | Click **Next: get the brief** (step 3). Scroll the on-screen brief; point at **Print or save as PDF**. | "Step three is the brief: both options, whether each is allowed, why they differ, what other priorities do, what is not checked, and three next steps: confirm zoning and site rules with City Planning, confirm control with the City, the URA, or the Land Bank, and get a hazard review for the mapped steep slope. Next, we want a two-week pilot with a CDC and a zoning reviewer." |

## Click sequence (for re-recording)

1. Load `/` in a fresh browser (the intro shows). Click **Next** once, then close with Escape (or click **Start guided example** in the intro).
2. Header: **Start guided example** → step 1 (Find sites); wait for the banner "25 parcels match…".
3. **Compare two housing options on this parcel →** → step 2; the answer card is at the top of the panel.
4. Open **How was this scored?** (points table) and **Where the numbers come from** (expand **Market activity & lot fit**).
5. In **What matters most to you?**, click **Housing-need emphasis**; read the "Ranking changed" line; open **One-factor sweep** inside "How was this scored?".
6. Click **Explain the difference in plain words**; wait for the label.
7. Click **Next: get the brief →** (step 3); scroll the brief; **Print or save as PDF** if showing print.

## Resolved facts used above (from the committed data, default weights)

- Shortlist: example `city-triplex`, 25 matches; top match PIN 0056F00338000000, Hazelwood, LNC, 5,100 sq ft vacant land, City status "available" (a record, not availability), 8% steep-slope overlap, 1.6 min straight-line to the SECOND AVE + FLOWERS AVE frequent stop.
- Balanced: triplex 72.6, townhouse/duplex 72.9 (close). Housing-need emphasis: triplex 71.5, townhouse 69.5. Five priorities: townhouse first under Balanced and Transit; triplex first under Housing-need, Lower-hazard, Lower-carbon.
- Sweep at balanced weights: equity equal at 30.85 (sampled change at 31), demand 21.35, carbon 23.84, climate no crossing, transit and displacement cannot reorder.
- Brief next steps: confirm §911.02 and dimensional rules with City Planning; verify control and availability with the City, the URA, or the Pittsburgh Land Bank; hazard review for the 25%+ slope overlap.
