import { evaluatePlanner, reweightPlanner } from './plannerModel.js'

export function sameEvaluationContext(a, b) {
  if (!a || !b) return false
  const keys = Object.keys(a).filter(key => key !== 'scenario')
  return keys.length === Object.keys(b).filter(key => key !== 'scenario').length && keys.every(key => a[key] === b[key])
}

/** One immutable evidence context and one last result, bounded to the current plan. */
export function createPlannerEvaluator() {
  let previous = null, previousKey, result
  const stats = { evaluated: 0, reweighted: 0 }
  function evaluate(input) {
    const { weights, ...scenarioEvidence } = input.scenario
    const key = JSON.stringify(scenarioEvidence)
    if (key === previousKey && sameEvaluationContext(previous, input)) {
      result = reweightPlanner(result, input); stats.reweighted++
    } else {
      result = evaluatePlanner(input); stats.evaluated++
    }
    previous = input; previousKey = key
    return result
  }
  return { evaluate, stats }
}
