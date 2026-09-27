/** The "Try an example" case. Both parcels are in LNC, where §911.02 permits both types by right, so the
 * comparison is about scores and weights rather than zoning. Resident and CDC presets favor B; the others favor A.
 */
export const DEMO_EXAMPLE = {
  title: "Lawrenceville townhouse vs Hazelwood small apartment",
  a: { slot: "A", pin: "0049B00237000000", typeId: "townhouse_duplex" },
  b: { slot: "B", pin: "0056F00090000000", typeId: "small_apartment" },
  story:
    "Building A is a townhouse / duplex at 4200 Butler St in Central Lawrenceville. Building B is a small apartment on vacant commercial land at 4820 2nd Ave in Hazelwood. Try the presets: the winner changes with what you value.",
}
