import { evaluatePlanner } from '../lib/plannerModel.js'
import { prepareNetwork } from '../lib/networkModel.js'

let networkContext = null

self.onmessage = event => {
  const { revision, input } = event.data
  if (event.data.type === 'network') { networkContext = event.data.network ? prepareNetwork(event.data.network) : null; return }
  try { self.postMessage({ revision, pin: input.feature.properties.pin, result: evaluatePlanner({ ...input, networkContext }) }) }
  catch (error) { self.postMessage({ revision, error: error.message }) }
}
