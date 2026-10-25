type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function requestAI(task: string, input: unknown): Promise<JsonObject> {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, input }),
  })

  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new Error(`AI API returned an invalid response (${response.status}). Verify the Vercel API deployment and server-side configuration.`)
  }

  if (!response.ok) {
    const detail = isJsonObject(result) && typeof result.error === 'string'
      ? result.error
      : `AI service returned ${response.status}.`
    throw new Error(detail)
  }
  if (!isJsonObject(result)) throw new Error('AI service returned an unexpected response.')
  window.dispatchEvent(new Event('auth:usage-updated'))
  return result
}
