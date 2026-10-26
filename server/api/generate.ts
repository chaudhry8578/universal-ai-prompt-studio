import { getAuthenticatedUser } from '../auth.js'
import { getDatabase } from '../database.js'
import { handleApiError, type ApiRequest, type ApiResponse, isSameOrigin } from '../http.js'

type GenerationTask =
  | 'ugc-image-prompt'
  | 'ugc-image-analysis'
  | 'ugc-video-prompts'
  | 'faceless-image-prompt'
  | 'storyboard-enhance-idea'
  | 'storyboard-choose-settings'
  | 'storyboard-choose-audio'
  | 'storyboard-plan'
  | 'storyboard-video-prompt'

type JsonObject = Record<string, unknown>

declare const process: { env: { OPENAI_API_KEY?: string } }

const ugcStyleDialogueInstructions: Record<string, string> = {
  'Natural Filipino UGC': 'Relaxed, friendly, believable everyday Filipino conversation; spontaneous and personal, never formal advertising copy.',
  Influencer: 'Confident, polished, expressive and engaging modern Taglish; talk naturally to followers without sounding like a television commercial.',
  'TikTok vlog': 'Authentic Filipino Gen Z creator energy: casual, spontaneous, playful and conversational, with expressive reactions and only occasional mild profanity when it fits naturally.',
  'Aesthetic lifestyle': 'Soft, relaxed, fashionable and conversational; understated delivery with no excessive excitement or loud reactions.',
  Playful: 'Funny, energetic, teasing and naturally entertaining, using Filipino humor without forced slang or repetitive jokes.',
  'Honest review': 'Straightforward, genuine, realistic and conversational; avoid fake testimonials, exaggerated guarantees and unverified product-performance claims.',
  'Affiliate budol': 'Persuasive but natural Filipino TikTok affiliate delivery: engaging, conversational and focused on the actual product, never pushy.',
  'Cinematic realistic': 'Natural, expressive, confident and understated; let the dialogue complement the cinematic visuals without removing dialogue.',
}

const ugcProductDialogueInstruction = 'First identify the actual product from the user brief and what is visibly shown in the approved image. Discuss only relevant observable details: footwear design, color and outfit styling; clothing appearance, styling and colors; bags’ visible design and styling; beauty products’ actual visible application or demonstration; technology features only when visible or verified; and home products’ demonstrated use. If the product or a detail is unclear, do not guess. Never invent specifications, comfort or performance claims, health benefits, discounts, stock levels, or results. Keep each clip focused on its actual product rather than generic praise.'

function getUgcStyleDialogueInstruction(style: unknown): string {
  return typeof style === 'string'
    ? ugcStyleDialogueInstructions[style] ?? 'Natural, relaxed Filipino creator conversation that fits the selected visual style.'
    : ugcStyleDialogueInstructions['Natural Filipino UGC']
}

const taskInstructions: Record<GenerationTask, string> = {
  'ugc-image-prompt': 'Return JSON with a prompt string containing one complete, natural, cinematic and ready-to-copy photorealistic vertical 9:16 image prompt. Build it from every supplied video setting and the creative brief, including character, location, action, style, camera and notes. Preserve requested character, outfit and product identity locks using @image1 for character, @image2 for outfit, and @image3 for product when those references are supplied. Match the product appearance exactly; do not redesign packaging, labels, colors, shape, or proportions. Do not invent product claims. Filenames and reference-role metadata are not image data: do not claim to have viewed or analyzed uploaded images.',
  'ugc-image-analysis': 'Return JSON with an analysis string describing only visible details in the approved image: the person and visible pose, outfit, product and packaging, location/background, framing, lighting, and the current hand/product positions. Explicitly identify unclear or obscured details as unknown. Do not infer personality, profession, product benefits, specifications, or unseen details. This visual analysis will guide a later image-to-video prompt, so state what is actually present and what must remain unchanged.',
  'ugc-video-prompts': 'Return JSON with exactly one prompt string for exactly one separate Google Flow image-to-video clip. Never combine multiple clips or extend the requested clip duration. State this clip duration verbatim and include TIMELINE:, VISUAL:, ACTION:, CAMERA:, DIALOGUE / VOICEOVER:, and AUDIO: sections. Use @image1 as the exact provided approved image and authoritative first frame. Animate the character and product already visible in @image1; preserve the exact character identity, face, hairstyle, outfit, product design, branding, accessories, lighting, and background, maintaining continuity with @image1 throughout and with the supplied clipSequence. Do not reconstruct the scene, replace the product, or invent additional elements. Use natural movements and camera motion compatible with the starting image. @image1 is the ONLY image reference: never use or mention @image2, @image3, or any other image reference. Never redesign the product, invent features, or add characters, outfits, or locations unless specifically requested in the user brief. Treat the user brief and additional notes as visual/action production instructions, not spoken dialogue; never read out or announce style, mood, aesthetic, visual, or action directions. Explicitly quoted speech may be used only when the user clearly requests that the character say those words. When settings.dialogue is None or an obsolete/unrecognized dialogue mode is supplied, specify no spoken dialogue, no voiceover, no lip-sync or speech-like mouth movements, no subtitles, no captions, no text overlays, and keep the video silent-speaking. When settings.dialogue is AI-generated Taglish, include natural Filipino Taglish speech relevant to the product and scene, with accurate lip-sync and a duration-appropriate brief line; do not read production instructions aloud. Never add text overlays, subtitles, captions, floating promotional text, or background music by default; use natural ambient sounds. Uploaded image files are not sent to this text service; do not claim to have viewed or analyzed them.',
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

export function buildOpenAIRequest(task: GenerationTask, input: JsonObject) {
  const isUGCImageAnalysis = task === 'ugc-image-analysis'
  const isUGCVideoPrompt = task === 'ugc-video-prompts'
  const ugcSettings = isUGCVideoPrompt && isJsonObject(input.settings) ? input.settings : undefined
  const dialogueMode = ugcSettings?.dialogue === 'AI-generated Taglish' ? 'AI-generated Taglish' : 'None'
  const requestInput = ugcSettings
    ? { ...input, settings: { ...ugcSettings, dialogue: dialogueMode } }
    : input
  const durationSeconds = typeof ugcSettings?.duration === 'string'
    ? Number.parseInt(ugcSettings.duration, 10)
    : undefined
  const ugcDialogueInstructions = dialogueMode === 'None'
    ? ' For this request, dialogue is None: the prompt must explicitly prohibit speech, voiceover, lip-sync or speech-like mouth movements, subtitles, captions, and all text overlays.'
    : dialogueMode === 'AI-generated Taglish'
      ? ` For this request, include connected, natural Filipino Taglish conversation in a modern Gen Z creator voice with accurate lip-sync, adapted to the selected UGC style (${typeof ugcSettings?.style === 'string' ? ugcSettings.style : 'Natural Filipino UGC'}): ${getUgcStyleDialogueInstruction(ugcSettings?.style)} ${ugcProductDialogueInstruction} Keep it to at most ${Math.max(1, Math.floor((durationSeconds ?? 10) * 2))} words for this clip, fewer when the action needs time. Vary the sentence structure and openings; do not use robotic one-liners, fixed example scripts, or a rigid language ratio. The user brief and additional notes control personality, actions, and visual direction and override the default style when explicit; never read those production instructions aloud. Preserve exact spoken lines only when explicitly requested. Treat Affiliate budol style as an explicit affiliate-style choice, but mention a basket, product link, checkout, or CTA only when a destination is supplied or configured; never invent a link, discount, stock level, or promotion.`
      : ''
  const clipSequence = isUGCVideoPrompt && isJsonObject(input.clipSequence) ? input.clipSequence : undefined
  const clipInstructions = typeof clipSequence?.index === 'number' && typeof clipSequence.total === 'number'
    ? ` This is separate clip ${clipSequence.index} of ${clipSequence.total}; make it independently usable, continue the same scene/action naturally, and do not merge it with another duration.`
    : ''
  const approvedImage = isUGCImageAnalysis && isJsonObject(input.approvedImage) ? input.approvedImage : undefined
  const imageUrl = typeof approvedImage?.dataUrl === 'string' ? approvedImage.dataUrl : approvedImage?.url
  const analysisTextInput = isUGCImageAnalysis
    ? `Respond in JSON. Task input:\n${JSON.stringify({ ...input, approvedImage: '[image attached]' })}`
    : `Respond in JSON. Task input:\n${JSON.stringify(requestInput)}`
  return {
    model: 'gpt-5-mini',
    instructions: `${taskInstructions[task]}${ugcDialogueInstructions}${clipInstructions}`,
    input: isUGCImageAnalysis
      ? [{
          role: 'user',
          content: [
            { type: 'input_text', text: analysisTextInput },
            { type: 'input_image', image_url: imageUrl, detail: 'high' },
          ],
        }]
      : `Respond in JSON. Task input:\n${JSON.stringify(requestInput)}`,
    max_output_tokens: task === 'storyboard-plan' ? 6000 : isUGCVideoPrompt ? 3500 : isUGCImageAnalysis ? 1200 : 2500,
    text: isUGCVideoPrompt
      ? {
          format: {
            type: 'json_schema',
            name: 'ugc_google_flow_video_prompt',
            strict: true,
            schema: {
              type: 'object',
              properties: { prompt: { type: 'string' } },
              required: ['prompt'],
              additionalProperties: false,
            },
          },
        }
      : { format: { type: 'json_object' } },
  }
}

export function parseOpenAIOutput(payload: unknown): JsonObject | undefined {
  if (!isJsonObject(payload)) return undefined
  const candidates: string[] = []
  if (typeof payload.output_text === 'string') candidates.push(payload.output_text)
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!isJsonObject(item) || !Array.isArray(item.content)) continue
      const text = item.content.flatMap((part) =>
        isJsonObject(part) && part.type === 'output_text' && typeof part.text === 'string' ? [part.text] : [],
      ).join('')
      if (text) candidates.push(text)
    }
  }
  for (const text of candidates) {
    try {
      const result: unknown = JSON.parse(text)
      if (isJsonObject(result)) return result
    } catch {
      continue
    }
  }
  return undefined
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function isValidTaskOutput(task: GenerationTask, input: JsonObject, output: JsonObject): boolean {
  switch (task) {
    case 'ugc-image-prompt':
    case 'faceless-image-prompt':
      return nonEmpty(output.prompt)
    case 'ugc-image-analysis':
      return nonEmpty(output.analysis)
    case 'ugc-video-prompts': {
      const prompt = output.prompt
      if (!nonEmpty(prompt)) return false
      const sections = ['TIMELINE:', 'VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:']
      const duration = isJsonObject(input.settings) ? input.settings.duration : undefined
      if (
        !sections.every((section) => prompt.includes(section)) ||
        typeof duration !== 'string' || !prompt.includes(duration) ||
        !/@image1\b/i.test(prompt) ||
        /@image(?!1\b)\w*/i.test(prompt) ||
        !/no background music/i.test(prompt) ||
        !/natural ambient/i.test(prompt) ||
        !/no text overlays/i.test(prompt) ||
        !/no subtitles/i.test(prompt) ||
        !/no captions/i.test(prompt)
      ) return false
      const dialogueMode = isJsonObject(input.settings) && input.settings.dialogue === 'AI-generated Taglish'
        ? 'AI-generated Taglish'
        : 'None'
      if (dialogueMode === 'None') {
        return /no spoken dialogue/i.test(prompt) &&
          /no voiceover/i.test(prompt) &&
          /no lip-sync/i.test(prompt) &&
          /no subtitles/i.test(prompt) &&
          /no captions/i.test(prompt) &&
          /no text overlays/i.test(prompt)
      }
      if (dialogueMode === 'AI-generated Taglish') {
        return /filipino taglish/i.test(prompt) && /accurate lip-sync/i.test(prompt)
      }
      return true
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
    if (task === 'ugc-image-analysis') {
      const approvedImage = input.approvedImage
      const dataUrl = isJsonObject(approvedImage) ? approvedImage.dataUrl : undefined
      const url = isJsonObject(approvedImage) ? approvedImage.url : undefined
      const validDataUrl = typeof dataUrl === 'string' &&
        dataUrl.length <= 950_000 &&
        /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
      let validUrl = false
      if (typeof url === 'string' && url.length <= 2048) {
        try {
          validUrl = new URL(url).protocol === 'https:'
        } catch {
          validUrl = false
        }
      }
      if (!validDataUrl && !validUrl) {
        res.status(400).json({ error: 'Image analysis requires an approved PNG, JPEG, or WebP image.' })
        return
      }
    }
    const maxInputLength = task === 'ugc-image-analysis' ? 1_000_000 : 40_000
    if (JSON.stringify(input).length > maxInputLength) {
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
          body: JSON.stringify(buildOpenAIRequest(task, input)),
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

      const output = parseOpenAIOutput(completion)
      if (!output) {
        await client.query('ROLLBACK')
        transactionOpen = false
        res.status(502).json({ error: 'OpenAI returned an invalid JSON response. Please try again.' })
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
