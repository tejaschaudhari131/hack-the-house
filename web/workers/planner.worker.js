import { evaluatePlanner } from '../lib/plannerModel.js'
import { prepareNetwork } from '../lib/networkModel.js'
import { snapToEdge, routeBetween } from '../lib/networkRouting.js'

let networkContext = null

self.onmessage = event => {
  const { revision, input } = event.data
  if (event.data.type === 'network') { networkContext = event.data.network ? prepareNetwork(event.data.network) : null; return }
  if (event.data.type === 'edit') {
    const { id, action, args } = event.data
    try { self.postMessage({ type: 'edit', id, result: action === 'snap' ? snapToEdge(networkContext?.network, ...args) : routeBetween(networkContext, ...args) }) }
    catch (error) { self.postMessage({ type: 'edit', id, error: error.message }) }
    return
  }
  try { self.postMessage({ revision, pin: input.feature.properties.pin, result: evaluatePlanner({ ...input, networkContext }) }) }
  catch (error) { self.postMessage({ revision, error: error.message }) }
}
