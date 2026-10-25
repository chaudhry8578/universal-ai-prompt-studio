type ApiRequest = {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}

type ApiResponse = {
  status(code: number): ApiResponse
  json(value: unknown): void
}

type GenerationTask =
  | 'ugc-idea'
  | 'ugc-image-prompt'
  | 'ugc-video-prompts'
  | 'faceless-image-prompt'
  | 'storyboard-enhance-idea'
  | 'storyboard-choose-settings'
  | 'storyboard-choose-audio'
  | 'storyboard-plan'
  | 'storyboard-video-prompt'

type JsonObject = Record<string, unknown>

declare const process: { env: { OPENAI_API_KEY?: string } }

const taskInstructions: Record<GenerationTask, string> = {
  'ugc-idea': 'Return JSON with a content string containing 3 concise creative UGC concepts, natural Filipino Taglish dialogue, and product-niche-specific creator actions. Avoid unsupported product claims.',
  'ugc-image-prompt': 'Return JSON with a prompt string for a photorealistic vertical 9:16 UGC still. Follow all supplied settings, preserve the requested character/outfit/product reference locks, and do not invent product claims. Uploaded image filenames or reference descriptions are not image data: do not claim to have viewed or analyzed any uploaded image.',
  'ugc-video-prompts': 'Return JSON with a clips array containing exactly the requested number of objects, each with a prompt string. Each prompt must include VISUAL:, ACTION:, CAMERA:, DIALOGUE:, and AUDIO: sections. Preserve the supplied duration, settings, dialogue and continuity. Uploaded image references are not provided to this text service; do not claim to have viewed or analyzed them.',
  'faceless-image-prompt': 'Return JSON with a prompt string for exactly one photorealistic premium product photograph in vertical 9:16 format. Follow the selected hand, shot, background and composition settings. Preserve product identity based only on the user-provided text; never claim to have viewed or analyzed uploaded images, whose filenames are not image data.',
  'storyboard-enhance-idea': 'Return JSON with an idea string that improves clarity and cinematic specificity while retaining the user’s intent and respecting product-identity constraints. Reference filenames are not image data; do not claim to analyze images.',
  'storyboard-choose-settings': 'Return JSON with settings containing mode, style and location. Choose only values present in allowedModes, allowedStyles and allowedLocations from the input. Preserve explicit user choices. Uploaded reference filenames are not image data; do not claim to analyze images.',
  'storyboard-choose-audio': 'Return JSON with mode set to exactly No Dialogue, Character Dialogue, or Voiceover, and a concise rationale. Respect user preferences and custom dialogue.',
  'storyboard-plan': 'Return JSON with durationSeconds (10, 20, or 30) and a storyboards array with exactly durationSeconds / 10 entries. Each entry must have a nonempty title and concept, and exactly six panels. Each panel must have numeric start and end timestamps forming contiguous intervals from 0 to exactly 10 seconds, plus nonempty description, camera and action strings, and an optional dialogue string. Choose the shortest suitable total duration. Keep each segment’s dialogue at 22 words maximum and preserve supplied custom dialogue verbatim. Do not invent product claims. Uploaded reference filenames are not image data; do not claim to have viewed or analyzed any uploaded image.',
  'storyboard-video-prompt': 'Return JSON with a prompt string that refines the supplied video-prompt draft without removing or weakening production constraints. Preserve VISUAL:, ACTION:, CAMERA:, DIALOGUE / VOICEOVER:, AUDIO:, TIMELINE:, and every product, character, outfit, and location identity lock. Preserve any exact custom dialogue verbatim. Do not claim that uploaded images were analyzed or that a video was rendered.',
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGenerationTask(value: unknown): value is GenerationTask {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(taskInstructions, value)
}

function extractOutputText(payload: unknown): string {
  if (!isJsonObject(payload) || !Array.isArray(payload.output)) return ''
  return payload.output.flatMap((item) => {
    if (!isJsonObject(item) || !Array.isArray(item.content)) return []
    return item.content.flatMap((part) =>
      isJsonObject(part) && part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [],
    )
  }).join('')
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const originHeader = req.headers?.origin
  const hostHeader = req.headers?.['x-forwarded-host'] ?? req.headers?.host
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  if (origin && host) {
    try {
      if (new URL(origin).host !== host.split(',')[0].trim()) {
        res.status(403).json({ error: 'Cross-origin AI requests are not allowed.' })
        return
      }
    } catch {
      res.status(403).json({ error: 'Invalid request origin.' })
      return
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'AI is unavailable: OPENAI_API_KEY is not configured on the server.' })
    return
  }

  if (!isJsonObject(req.body) || !isGenerationTask(req.body.task) || !isJsonObject(req.body.input)) {
    res.status(400).json({ error: 'Request must include a supported task and an input object.' })
    return
  }

  const { task, input } = req.body
  if (JSON.stringify(input).length > 40_000) {
    res.status(413).json({ error: 'AI request is too large. Shorten the supplied text and try again.' })
    return
  }

  let providerResponse: Response
  try {
    providerResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        instructions: taskInstructions[task],
        input: JSON.stringify(input),
        max_output_tokens: task === 'storyboard-plan' ? 6000 : 2500,
        text: { format: { type: 'json_object' } },
      }),
    })
  } catch {
    res.status(502).json({ error: 'Could not connect to the OpenAI service. Please try again.' })
    return
  }

  if (!providerResponse.ok) {
    const failure = await providerResponse.json().catch(() => null)
    const detail = isJsonObject(failure) && isJsonObject(failure.error) && typeof failure.error.message === 'string'
      ? failure.error.message
      : `OpenAI returned ${providerResponse.status}.`
    res.status(502).json({ error: `AI generation failed: ${detail}` })
    return
  }

  const completion: unknown = await providerResponse.json()
  const outputText = extractOutputText(completion)
  if (!outputText) {
    res.status(502).json({ error: 'OpenAI returned no generated text. Please try again.' })
    return
  }

  try {
    const output: unknown = JSON.parse(outputText)
    if (!isJsonObject(output)) throw new Error('Expected a JSON object.')
    res.status(200).json(output)
  } catch {
    res.status(502).json({ error: 'OpenAI returned an invalid structured response. Please try again.' })
  }
}
