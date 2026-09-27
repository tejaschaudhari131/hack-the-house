// Base standards only. Bonuses, variances and contextual exceptions need review.
// Reviewed against Pittsburgh's published Title Nine, 2026-09-27.
export const TITLE_NINE_VERSION = 'title-nine-screen-1.0'
export const CODE = {
  residential: ['903', '45474194'], mixed: ['904', '45474350'], special: ['905', '45474542'],
  overlays: ['906', '45474902'], inclusionary: ['907.04', '45475328'], use: ['911.02', '45476515'],
  parking: ['914', '45478031'], environment: ['915', '45478225'], compatibility: ['916', '45478350'],
  landscape: ['918', '45478442'], review: ['922', '45479034'], measurements: ['925', '45479639'],
}
export const codeLink = key => `https://ecode360.com/${CODE[key][1]}`

export function districtStandards(code) {
  const residential = /^(R1D|R1A|R2|R3|RM)-(VL|L|M|H|VH)$/.exec(code || '')
  if (residential) {
    const [, family, density] = residential, index = ['VL', 'L', 'M', 'H', 'VH'].indexOf(density)
    const multi = family === 'RM'
    return { source: 'residential', section: '903.03', family, density,
      minLot: [6000, 3000, 2400, 1200, null][index],
      height: multi ? [40, 40, 55, 85, 180][index] : 40,
      stories: multi ? [3, 3, 4, 9, null][index] : 3,
      yards: multi ? [[30, 30, 30, 30], [25, 25, 30, 25], [25, 25, 25, 10], [25, 25, 25, 10], [25, 25, 25, 10]][index]
        : [[30, 30, 30, family === 'R1A' ? 5 : 10], [30, 30, 30, 5], [30, 30, 30, 5], [15, 15, 15, 5], [5, 15, 5, 5]][index],
      // One VL side can be 5 ft; using 10 on every side is a sufficient, conservative test.
      minYard: multi ? [30, 25, 10, 10, 10][index] : 5,
    }
  }
  const mixed = {
    NDO: [1, 3, 90, 45, 3, 0, 10], LNC: [2, 2, 90, 45, 3, 0, 0],
    NDI: [3, 2, 90, 45, 3, 0, 0], UNC: [4, 3, null, 45, 3, 0, 0],
    HC: [5, 2, null, 75, 5, 0, 0], GI: [6, 3, null, 75, 5, 10, 0], UI: [7, 3, null, 60, 4, 10, 0],
  }[code]
  if (mixed) {
    const [chapter, far, coverage, height, stories, side, rearOnWay] = mixed
    return { source: 'mixed', section: `904.0${chapter}`, far, coverage, height, stories, yards: [0, 20, side, side], minYard: 0, rearOnWay }
  }
  if (code === 'P') return { source: 'special', section: '905.01', minLot: 3200, far: 1, height: 40, stories: 3, yards: [30, 20, 20, 5], minYard: 5 }
  if (code === 'H') return { source: 'special', section: '905.02', minLot: 3200, height: 40, stories: 3, yards: [0, 0, 0, 0], minYard: 0, disturbance: 50 }
  return null
}
