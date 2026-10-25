import { getAuthenticatedUser } from '../server/auth'
import { getDatabase } from '../server/database'
import { handleApiError, type ApiRequest, type ApiResponse, isSameOrigin } from '../server/http'

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

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isValidTaskOutput(task: GenerationTask, input: JsonObject, output: JsonObject): boolean {
  switch (task) {
    case 'ugc-idea':
      return nonEmpty(output.content)
    case 'ugc-image-prompt':
    case 'faceless-image-prompt':
      return nonEmpty(output.prompt)
    case 'ugc-video-prompts': {
      const expected = Array.isArray(input.clipDurations) ? input.clipDurations.length : 0
      return expected > 0 && Array.isArray(output.clips) && output.clips.length === expected &&
        output.clips.every((clip) => {
          if (!isJsonObject(clip)) return false
          const prompt = clip.prompt
          if (!nonEmpty(prompt)) return false
          return ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE:', 'AUDIO:'].every((section) => prompt.includes(section))
        })
    }
    case 'storyboard-enhance-idea':
      return nonEmpty(output.idea)
    case 'storyboard-choose-settings': {
      const settings = output.settings
      return isJsonObject(settings) &&
        (Array.isArray(input.allowedModes) && input.allowedModes.includes(settings.mode)) &&
        (Array.isArray(input.allowedStyles) && input.allowedStyles.includes(settings.style)) &&
        (Array.isArray(input.allowedLocations) && input.allowedLocations.includes(settings.location))
    }
    case 'storyboard-choose-audio':
      return (output.mode === 'No Dialogue' || output.mode === 'Character Dialogue' || output.mode === 'Voiceover') &&
        nonEmpty(output.rationale)
    case 'storyboard-plan': {
      const duration = output.durationSeconds
      const storyboards = output.storyboards
      if ((duration !== 10 && duration !== 20 && duration !== 30) || !Array.isArray(storyboards) || storyboards.length !== duration / 10) return false
      let dialogue = ''
      for (const storyboard of storyboards) {
        if (!isJsonObject(storyboard) || !nonEmpty(storyboard.title) || !nonEmpty(storyboard.concept) ||
          !Array.isArray(storyboard.panels) || storyboard.panels.length !== 6) return false
        let cursor = 0
        const descriptions = new Set<string>()
        for (const panel of storyboard.panels) {
          if (!isJsonObject(panel) || typeof panel.start !== 'number' || typeof panel.end !== 'number' ||
            !nonEmpty(panel.description) || !nonEmpty(panel.camera) || !nonEmpty(panel.action) ||
            (panel.dialogue !== undefined && typeof panel.dialogue !== 'string')) return false
          if (panel.start !== cursor || panel.end <= panel.start || panel.end > 10) return false
          cursor = panel.end
          const normalized = panel.description.trim().toLocaleLowerCase()
          if (descriptions.has(normalized)) return false
          descriptions.add(normalized)
          const spoken = typeof panel.dialogue === 'string' ? panel.dialogue : ''
          if (spoken.trim().split(/\s+/).filter(Boolean).length > 22) return false
          dialogue += `${spoken} `
        }
        if (cursor !== 10 || descriptions.size !== 6) return false
      }
      if (input.audio === 'Custom Dialogue' && nonEmpty(input.customDialogue) && !dialogue.includes(input.customDialogue.trim())) return false
      return true
    }
    case 'storyboard-video-prompt': {
      const prompt = output.prompt
      if (!nonEmpty(prompt)) return false
      const sections = ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:', 'TIMELINE:']
      return sections.every((section) => prompt.includes(section)) &&
        (!nonEmpty(input.customDialogue) || prompt.includes(input.customDialogue.trim()))
    }
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin AI requests are not allowed.' })
    return
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' })
      return
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

    const client = await getDatabase().connect()
    let transactionOpen = false
    try {
      await client.query('BEGIN')
      transactionOpen = true

      const quota = await client.query(
        `INSERT INTO daily_usage (user_id, usage_date, successful_generations)
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date, 1)
         ON CONFLICT (user_id, usage_date) DO UPDATE
         SET successful_generations = daily_usage.successful_generations + 1
         WHERE daily_usage.successful_generations < 20
         RETURNING successful_generations`,
        [user.id],
      )
      if (quota.rows.length === 0) {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(429).json({ error: 'Daily AI generation limit reached (20 per UTC day).' })
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
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'Could not connect to the OpenAI service. Please try again.' })
        return
      }

      if (!providerResponse.ok) {
        const failure = await providerResponse.json().catch(() => null)
        const detail = isJsonObject(failure) && isJsonObject(failure.error) && typeof failure.error.message === 'string'
          ? failure.error.message
          : `OpenAI returned ${providerResponse.status}.`
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: `AI generation failed: ${detail}` })
        return
      }

      let completion: unknown
      try {
        completion = await providerResponse.json()
      } catch {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'OpenAI returned an invalid response. Please try again.' })
        return
      }

      const outputText = extractOutputText(completion)
      if (!outputText) {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'OpenAI returned no generated text. Please try again.' })
        return
      }

      let output: unknown
      try {
        output = JSON.parse(outputText)
      } catch {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'OpenAI returned an invalid structured response. Please try again.' })
        return
      }
      if (!isJsonObject(output)) {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'OpenAI returned an invalid structured response. Please try again.' })
        return
      }
      if (!isValidTaskOutput(task, input, output)) {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'OpenAI returned an incomplete or invalid generation. Please try again.' })
        return
      }

      await client.query('COMMIT')
      transactionOpen = false
      res.status(200).json(output)
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          console.error(
            '[generate] Failed to roll back the generation transaction.',
            rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
          )
        }
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    handleApiError(res, 'generate', error)
  }
}
