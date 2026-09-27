import { evaluatePlanner } from '../lib/plannerModel.js'

self.onmessage = event => {
  const { revision, input } = event.data
  try { self.postMessage({ revision, result: evaluatePlanner(input) }) }
  catch (error) { self.postMessage({ revision, error: error.message }) }
}
