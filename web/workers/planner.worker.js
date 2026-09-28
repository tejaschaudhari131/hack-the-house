import { createPlannerEvaluator } from '../lib/plannerEvaluation.js'
import { prepareNetwork } from '../lib/networkModel.js'
import { snapToEdge, routeBetween } from '../lib/networkRouting.js'

let networkContext = null
let context = null
const evaluator = createPlannerEvaluator()

self.onmessage = event => {
  const { revision, scenario } = event.data
  if (event.data.type === 'network') { networkContext = event.data.network ? prepareNetwork(event.data.network) : null; return }
  if (event.data.type === 'edit') {
    const { id, action, args } = event.data
    try { self.postMessage({ type: 'edit', id, result: action === 'snap' ? snapToEdge(networkContext?.network, ...args) : routeBetween(networkContext, ...args) }) }
    catch (error) { self.postMessage({ type: 'edit', id, error: error.message }) }
    return
  }
  if (event.data.context) context = event.data.context
  try { self.postMessage({ revision, pin: context.feature.properties.pin, result: evaluator.evaluate({ ...context, scenario, networkContext }) }) }
  catch (error) { self.postMessage({ revision, error: error.message }) }
}
