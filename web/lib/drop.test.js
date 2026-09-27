import test from "node:test"
import assert from "node:assert/strict"

import { BUILDINGS } from "./buildings.js"
import { circlePolygon, featurePoint, haversineMeters, stopsWithin } from "./geo.js"

test("building defaults cover the four types", () => {
  assert.equal(BUILDINGS.single_family.units, 1)
  assert.equal(BUILDINGS.townhouse_duplex.units, 2)
  assert.ok(BUILDINGS.small_apartment.units >= 3 && BUILDINGS.small_apartment.units <= 19)
  assert.ok(BUILDINGS.large_apartment.units >= 20)
  assert.ok(BUILDINGS.large_apartment.heightM > BUILDINGS.single_family.heightM)
})

test("the 800 meter ring is drawn at 800 m straight-line from the parcel", () => {
  const polygon = circlePolygon(-79.96, 40.45, 800, 64)
  const north = polygon.coordinates[0].find((coord) => coord[1] > 40.45)
  const distance = haversineMeters(-79.96, 40.45, north[0], north[1])
  assert.ok(Math.abs(distance - 800) < 30)
})

test("feature point stays on a simple parcel ring", () => {
  const point = featurePoint({
    type: "Polygon",
    coordinates: [
      [
        [-80, 40],
        [-79.99, 40],
        [-79.99, 40.01],
        [-80, 40.01],
        [-80, 40],
      ],
    ],
  })
  assert.ok(Math.abs(point[0] + 79.995) < 0.002)
  assert.ok(Math.abs(point[1] - 40.005) < 0.002)
})

test("stops inside the ring are summed and outside stops are left out", () => {
  const collection = {
    features: [
      {
        geometry: { type: "Point", coordinates: [-79.96, 40.45] },
        properties: { name: "Near", weekday_trips: 10, routes: ["56"] },
      },
      {
        geometry: { type: "Point", coordinates: [-79.9, 40.45] },
        properties: { name: "Far", weekday_trips: 99, routes: ["99"] },
      },
    ],
  }
  const summary = stopsWithin(collection, -79.96, 40.45, 800)
  assert.equal(summary.count, 1)
  assert.equal(summary.trips, 10)
  assert.deepEqual(summary.routes, ["56"])
})
