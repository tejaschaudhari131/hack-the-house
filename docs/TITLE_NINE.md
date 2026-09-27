# Title Nine screening

Studio applies supported yes/no zoning checks before ranking housing. **A supported conflict or a failed physical fit produces no overall housing score.** Priority weights cannot override that result.

Rules without enough evidence are **not assessed**. They are excluded from eligibility, not counted as passes or failures. Required approvals and discretionary exceptions stay visible as review notes. A remaining score compares housing under the assessed rules; it is not full zoning clearance.

## Implemented checks

| Rules | Evidence / limits |
| --- | --- |
| [§911.02 uses](https://ecode360.com/45476515) | Existing district/use table. Duplex and attached house use separate rows and unit counts in Studio. |
| [§903 residential](https://ecode360.com/45474194), [§904 mixed](https://ecode360.com/45474350), [§905 P/H](https://ecode360.com/45474542) | Base height, stories, minimum lot size, FAR, coverage or disturbance where specified. Uses mapped lot area and proposed dimensions. |
| Base setbacks | A sufficient pass only when the proposal clears the largest base yard from every parcel edge. Otherwise excluded until legal frontage and edge roles are available. |
| [§916 compatibility](https://ecode360.com/45478350) | Height/story caps with an explicitly entered distance to a protected R1D/R1A/R2/R3/H district. Other compatibility tests lack evidence and are excluded. |
| [§906 overlays](https://ecode360.com/45474902) | Incomplete overlay coverage and mapped hazard proxies are review notes. A hazard overlap alone does not prohibit housing. |
| [§907.04 inclusionary housing](https://ecode360.com/45475328) | On-site unit-count test for an assumed single project of 20+ homes wholly inside confirmed/assumed IZ coverage. Mixed/unknown boundaries are excluded. Covenants, official AMI, unit mix and off-site options require review. |
| [§914 parking](https://ecode360.com/45478031) | Residential minimum/maximum car counts when the base schedule is explicitly selected; bike counts and protected spaces. Layout/access and exemptions need more evidence. |
| [§915.02 environment](https://ecode360.com/45478225) | Entered grading clearance, wall height, tree survey and replacement diameter. Steeper cut/fill can require engineering approval; it is not an unconditional prohibition. |
| [§918 landscaping](https://ecode360.com/45478442) | Street-tree, parking-tree and landscape-area quantities when applicability and quantities are supplied. Layout, buffers and screening remain excluded. |

## Model boundaries

- Rules reviewed against the published code on 2026-09-27; version `title-nine-screen-1.0`. Pending legislation is not applied.
- Supported base districts: R1D/R1A/R2/R3/RM density variants, NDO, LNC, NDI, UNC, HC, GI, UI, P and H. Unimplemented district standards (including RIV, EMI and SP plans) are explicitly excluded.
- Each mapped parcel is assumed to be one zoning lot. Split zoning, assemblages, established nonconformities, bonuses and contextual exceptions require further evidence.
- FAR and coverage combine every proposed building on the same parcel. Existing GFA and coverage stay unknown unless entered or mapped building context is empty. Proposed floor area is width × depth × stories, not assessed living area.
- The plan is assumed to be one project for IZ. Related phases/conversions outside this plan must be considered separately. Entered household income is never treated as legal AMI.
- Site inputs are scenario assumptions, retained by parcel ID. They do not certify approval. New roads, parks and transit service do not automatically change zoning, grant parking reductions or remove environmental requirements.
- Every next-building alternative rechecks the entire placed plan. A conflict in any member withholds the combined housing score; the placed-plan score remains separate.
- The original Explorer, source datasets, source scoring model and parcel download are unchanged.

Implementation: `web/lib/titleNineRules.js`, `web/lib/titleNine.js`, and the Studio evaluator in `web/lib/plannerModel.js`. Tests cover evidence exclusion, thresholds, aggregation and independent legal/physical score gates.
