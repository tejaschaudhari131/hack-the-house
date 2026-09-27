import { createExplainHandler } from "../../../lib/explainHandler.js"
import { loadServerData } from "../../../lib/serverData.js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const handleExplain = createExplainHandler({ loadData: loadServerData })

export async function POST(request) {
  return handleExplain(request)
}
