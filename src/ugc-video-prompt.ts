export type UgcVideoPromptSettings = {
  duration: string
  style: string
  niche: string
  action: string
  customAction: string
  location: string
  customLocation: string
  cameraAngles: string[]
  cameraMovement: string
  shotPlan: string
  dialogue: 'None' | 'AI-generated Taglish'
  notes: string
}

export type UgcDialogueMode = 'None' | 'AI-generated Taglish'

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

export function getUgcStyleDialogueInstruction(style: string): string {
  return ugcStyleDialogueInstructions[style] ?? 'Natural, relaxed Filipino creator conversation that fits the selected visual style.'
}

export const ugcProductDialogueInstruction = 'First identify the actual product from the user brief and what is visibly shown in the approved image. Discuss only relevant observable details: footwear design, color and outfit styling; clothing appearance, styling and colors; bags’ visible design and styling; beauty products’ actual visible application or demonstration; technology features only when visible or verified; and home products’ demonstrated use. If the product or a detail is unclear, do not guess. Never invent specifications, comfort or performance claims, health benefits, discounts, stock levels, or results. Keep each clip focused on its actual product rather than generic praise.'

export function normalizeUgcDialogueMode(value: unknown): UgcDialogueMode {
  return value === 'AI-generated Taglish' ? value : 'None'
}

export function getUgcClipDurations(duration: string): number[] {
  const seconds = Number.parseInt(duration, 10)
  if (![10, 15, 20, 30].includes(seconds)) {
    throw new Error(`Unsupported UGC video duration: ${duration}`)
  }
  return seconds === 15 ? [10, 5] : Array.from({ length: seconds / 10 }, () => 10)
}

const approvedImageLock = 'IMAGE-TO-VIDEO STARTING IMAGE: Use @image1 as the exact provided approved image and authoritative first frame. Animate the character and product already visible in @image1. Preserve the exact character identity, face, hairstyle, outfit, product design, branding, accessories, lighting, and background. Maintain continuity with @image1 throughout the video. Do not reconstruct the scene, replace the product, or invent additional elements. Use natural movements and camera motion compatible with @image1. @image1 is the only image reference; do not use or mention any other image references.'

export function finalizeUgcVideoPrompt(prompt: string): string {
  if (!prompt.trim()) throw new Error('The Google Flow video prompt cannot be empty.')
  if (/@image(?!1\b)\w*/i.test(prompt)) {
    throw new Error('The Google Flow video prompt can use only @image1. Remove other image references and try again.')
  }
  return `${approvedImageLock}\n\n${prompt.trim()}`
}

export function buildUgcVideoPrompt(
  settings: UgcVideoPromptSettings,
  brief: string,
  clipSequence?: { index: number; total: number },
): string {
  const seconds = Number.parseInt(settings.duration, 10)
  const maxDialogueWords = Math.max(1, Math.floor(seconds * 2))
  const dialogueMode = normalizeUgcDialogueMode(settings.dialogue)
  const dialogue = dialogueMode === 'None'
    ? 'No spoken dialogue. No voiceover. No lip-sync or mouth movements suggesting speech. No subtitles. No captions. No text overlays. No floating promotional text.'
    : `Generate connected, natural Filipino Taglish conversation in a modern Gen Z creator voice, with accurate lip-sync, adapting the delivery to the selected UGC style: ${getUgcStyleDialogueInstruction(settings.style)} ${ugcProductDialogueInstruction} Keep dialogue to ${maxDialogueWords} spoken words maximum for this ${settings.duration} clip; use fewer when the action needs time. Vary openings and phrasing; do not use a rigid language ratio, robotic one-liners, or copied example scripts. Treat the brief and additional notes as production instructions for personality, actions, and visuals, not as words to say. Never announce or read out those instructions. If the user explicitly requests exact spoken words, preserve those words verbatim; otherwise do not turn directions into dialogue. Treat Affiliate budol style as an explicit affiliate-style choice, but mention a basket, product link, checkout, or CTA only when a destination is supplied or configured; never imply a link, discount, or offer exists unless supplied.`
  const clipProgression = clipSequence
    ? clipSequence.index === 1
      ? 'Introduce the creator and give an initial, product-specific reaction; do not force a CTA.'
      : clipSequence.index === clipSequence.total
        ? 'Continue naturally from the previous clip, add a concise closing thought, and use a CTA only when appropriate; do not repeat the introduction.'
        : 'Continue naturally from the previous clip by adding a new product detail or styling observation; do not repeat the introduction or force a CTA.'
    : 'For this standalone clip, get to the product-specific observation quickly; use a concise CTA only when appropriate.'
  const location = settings.location === 'Custom' ? settings.customLocation || 'the selected custom location' : settings.location
  const action = settings.action === 'Custom' ? settings.customAction || 'the selected custom action' : settings.action
  const prompt = [
    `TIMELINE: One separate ${settings.duration} image-to-video clip${clipSequence ? `, clip ${clipSequence.index} of ${clipSequence.total}` : ''}. Begin from the approved image as the exact authoritative first frame and animate that image; do not reconstruct or replace its scene. ${clipSequence && clipSequence.index > 1 ? 'Continue the same scene and action naturally from the preceding clip without changing the character, product, location, lighting, or visual style.' : ''}Dialogue progression: ${clipProgression} ${clipSequence && clipSequence.index < clipSequence.total ? 'End at a natural action beat that can continue smoothly in the next clip.' : ''}`,
    `VISUAL: Natural, cinematic ${settings.style} motion in the approved image's original location, lighting, and composition. Preserve the approved image exactly: same character, hair, skin tone, body proportions, outfit, accessories, product, branding, and framing. Do not introduce new locations, outfits, characters, or product features unless explicitly requested in the creative direction. No text overlays. No subtitles. No captions. No floating promotional text.`,
    `ACTION: Animate only a natural continuation of what is already visible in the approved image. Treat the user's brief as visual and production direction, not spoken dialogue: apply style requests visually (for example, Korean-inspired styling means visual styling, never announcing "Korean style"). Follow this direction without contradicting the starting frame: ${brief.trim()}. Selected action: ${action.toLowerCase()}. Use subtle facial expressions and realistic body movement. If the product is already being held or shown, keep presenting it naturally; never make the character retrieve it or recreate a reveal.`,
    `CAMERA: ${settings.cameraAngles.join(', ') || 'eye-level'} framing; ${settings.cameraMovement.toLowerCase()} movement. Prefer a gentle push-in or pull-back and product-focused close-ups that do not alter product appearance. Avoid unnecessary cuts, dramatic reframing, and changes to the original composition. ${settings.shotPlan === 'Auto' ? 'Use one continuous take unless a cut is explicitly requested.' : `Use ${settings.shotPlan.toLowerCase()} only as subtle, motivated framing changes without scene cuts.`}`,
    `DIALOGUE / VOICEOVER: ${dialogue}`,
    `AUDIO: Natural ambient and action sounds only. No background music unless explicitly requested. ${settings.notes ? `Additional production direction (apply visually or through action; do not speak or read aloud): ${settings.notes}` : ''}`,
    `SETTING LOCK: Keep the existing approved location (${location}), lighting, and composition throughout. No text overlays, subtitles, or captions.`,
  ].join('\n\n')
  return finalizeUgcVideoPrompt(prompt)
}
