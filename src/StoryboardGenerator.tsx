import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { requestAI } from './ai'

type ReferenceSlot = 'product' | 'character' | 'outfit' | 'location'
type ReferenceImage = { file: File; preview: string }
type StoryMode = 'Product Commercial' | 'Living Lifestyle' | 'Cinematic Mini Story' | 'AI Choose Mode'
type AudioMode = 'No Dialogue' | 'Character Dialogue' | 'Voiceover' | 'Custom Dialogue' | 'AI Choose Audio'
type PlanDuration = 10 | 20 | 30
type Panel = { description: string; camera: string; action: string; dialogue: string; start: number; end: number }
type Storyboard = { title: string; concept: string; panels: Panel[] }
type SceneImage = { url: string; approved: boolean }

const storyboardApiBase = import.meta.env.VITE_UGC_AI_API_URL?.replace(/\/$/, '')
const allowedPlanDurations: PlanDuration[] = [10, 20, 30]
const modes: { name: StoryMode; detail: string }[] = [
  { name: 'Product Commercial', detail: 'Polished, product-first advertising compositions.' },
  { name: 'Living Lifestyle', detail: 'Natural human moments and authentic product use.' },
  { name: 'Cinematic Mini Story', detail: 'A connected narrative with a satisfying payoff.' },
  { name: 'AI Choose Mode', detail: 'Get a recommendation from your configured AI service.' },
]
const styleOptions = [
  ['Luxury Commercial', 'Refined materials, considered light, premium restraint.'],
  ['Cinematic Product', 'Dramatic yet believable product-focused imagery.'],
  ['Minimalist Studio', 'Clean negative space and precise compositions.'],
  ['Aesthetic Lifestyle', 'Editorial lifestyle framing with tactile detail.'],
  ['Viral TikTok Product', 'Fast, clear visual hooks made for vertical feeds.'],
  ['Dark Luxury', 'Deep tones, controlled highlights, premium contrast.'],
  ['Daily Lifestyle', 'Approachable everyday product moments.'],
  ['Floating Product', 'Surreal suspension while keeping the product accurate.'],
  ['Splash Commercial', 'Dynamic liquid or material accents, without obscuring product.'],
  ['Unboxing Storyboard', 'A paced reveal of the actual product and packaging.'],
  ['Macro Product Details', 'Close material, construction, and visible feature studies.'],
  ['Nature Commercial', 'Organic surroundings and natural light.'],
  ['Fashion Editorial', 'Confident editorial styling and composed movement.'],
  ['Beauty Campaign', 'Refined beauty campaign lighting and close detail.'],
  ['Own Creative', 'Build a visual direction from your custom concept.'],
  ['Model Lifestyle', 'Human-centered, natural commercial storytelling.'],
  ['Daily Life Story', 'A believable routine with a clear product role.'],
  ['Cinematic Mini Story', 'Connected cinematic beats and a visual payoff.'],
  ['Luxury Lifestyle', 'Elevated real-world settings with understated luxury.'],
  ['Street Style', 'Urban energy, candid movement, editorial framing.'],
  ['Cozy Home Lifestyle', 'Warm domestic light and comfortable natural action.'],
  ['Friends Lifestyle', 'Sociable, genuine moments with natural interactions.'],
  ['Couple Lifestyle', 'Authentic shared moments and coherent character continuity.'],
  ['Travel Adventure', 'A purposeful journey with product continuity.'],
  ['Product in Action', 'Clear practical interaction without invented claims.'],
  ['Creative Commercial', 'Distinctive visual ideas grounded in product accuracy.'],
  ['Fashion Walking Campaign', 'A controlled, natural fashion walk and editorial finish.'],
  ['AI Choose Style', 'Get a recommendation from your configured AI service.'],
] as const
const locations = [
  'Luxury Commercial Studio', 'Clean White Studio', 'Warm Lifestyle Environment', 'Premium Dark Studio',
  'Natural Home Environment', 'Modern Bedroom', 'Modern Living Room', 'Urban Street', 'Outdoor Café',
  'Shopping Mall', 'Nature / Park', 'Luxury Interior', 'Reference Location', 'Custom Location', 'AI Choose Location',
]
const audioModes: { name: AudioMode; detail: string }[] = [
  { name: 'No Dialogue', detail: 'Environmental and product sounds only.' },
  { name: 'Character Dialogue', detail: 'Brief natural on-camera speech with active-speaker lip sync.' },
  { name: 'Voiceover', detail: 'Narration complements the product visuals.' },
  { name: 'Custom Dialogue', detail: 'Use your script as written and check its fit.' },
  { name: 'AI Choose Audio', detail: 'Get a recommendation from your configured AI service.' },
]
const slotDetails: { slot: ReferenceSlot; title: string; label: string; help: string }[] = [
  { slot: 'product', title: 'Product reference', label: '@image1 · REQUIRED', help: 'Preserve visible brand, colors, shape, materials, packaging, logos, and details.' },
  { slot: 'character', title: 'Character reference', label: '@image2 · OPTIONAL', help: 'Preserve identity, face, hairstyle, skin tone, and natural proportions.' },
  { slot: 'outfit', title: 'Outfit reference', label: '@image3 · OPTIONAL', help: 'Preserve the visible clothing design, colors, and details.' },
  { slot: 'location', title: 'Location reference', label: '@image4 · OPTIONAL', help: 'Use the uploaded environment as a visual reference.' },
]

function createTimeline(): Panel[] {
  const lengths = [1.5, 1.5, 1.5, 1.5, 2, 2]
  let start = 0
  return lengths.map((length) => {
    const panel = { start: Number(start.toFixed(1)), end: Number((start + length).toFixed(1)) }
    start += length
    return { ...panel, description: '', camera: '', action: '', dialogue: '' }
  })
}

function isValidTimeline(panels: Panel[]) {
  return panels.length === 6 &&
    panels[0]?.start === 0 &&
    panels[5]?.end === 10 &&
    panels.every((panel, index) =>
      Number.isFinite(panel.start) && Number.isFinite(panel.end) &&
      panel.start >= 0 && panel.end <= 10 &&
      panel.end > panel.start && (index === 0 || panel.start === panels[index - 1].end),
    )
}

function validStoryboardPlan(storyboards: Storyboard[], duration: number) {
  if (!allowedPlanDurations.includes(duration as PlanDuration) || storyboards.length !== duration / 10) return false
  const panelSeconds = storyboards.reduce((total, storyboard) => {
    if (!isValidTimeline(storyboard.panels)) return Number.NaN
    const uniqueDescriptions = new Set(storyboard.panels.map((panel) => panel.description.trim().toLocaleLowerCase()))
    const dialogueWords = storyboard.panels.reduce((count, panel) => count + countWords(panel.dialogue), 0)
    if (uniqueDescriptions.size !== 6 || storyboard.panels.some((panel) => !panel.description.trim()) || dialogueWords > 22) return Number.NaN
    return total + storyboard.panels.reduce((segmentTotal, panel) => segmentTotal + panel.end - panel.start, 0)
  }, 0)
  return Number.isFinite(panelSeconds) && Math.abs(panelSeconds - duration) < 0.001
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function draftDuration(dialogue: string): PlanDuration {
  const dialogueSegments = Math.ceil(countWords(dialogue) / 22)
  return (Math.min(3, Math.max(1, dialogueSegments)) * 10) as PlanDuration
}

function fileName(refs: Partial<Record<ReferenceSlot, ReferenceImage>>, slot: ReferenceSlot) {
  return refs[slot]?.file.name ?? 'Not provided'
}

function imageUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Image service response must contain an imageUrl.')
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value)) return value
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return value
  } catch {
    throw new Error('Image service returned an invalid image URL.')
  }
  throw new Error('Image service returned an unsupported image URL.')
}

function imagePromptFor(story: Storyboard, index: number, mode: StoryMode, style: string, location: string, refs: Partial<Record<ReferenceSlot, ReferenceImage>>) {
  const panels = story.panels.map((panel, panelIndex) =>
    `Panel ${panelIndex + 1} (${panel.start.toFixed(1)}–${panel.end.toFixed(1)}s): ${panel.description} Camera: ${panel.camera}. Action: ${panel.action}.`,
  ).join('\n')
  return [
    `Create one cohesive commercial storyboard image: "${story.title}", storyboard ${index + 1}.`,
    `Product reference @image1 (${fileName(refs, 'product')}) is authoritative. Preserve the exact visible product, brand, color, logo, packaging, material, shape, proportions, and construction. Never invent hidden features or claims.`,
    refs.character && `Character reference @image2 (${fileName(refs, 'character')}): preserve identity, facial features, hairstyle, skin tone, and realistic proportions.`,
    refs.outfit && `Outfit reference @image3 (${fileName(refs, 'outfit')}): match its visible design, colors, fit, and details.`,
    refs.location && `Location reference @image4 (${fileName(refs, 'location')}): use as the environment reference.`,
    `Mode: ${mode}. Visual style: ${style}. Location: ${location}. Concept: ${story.concept}`,
    'Exactly six equally sized, photorealistic commercial panels in a strict 2-column × 3-row grid. Overall portrait 9:16 aspect ratio, narrow clean dividers, cohesive lighting and color grade, consistent product and character identity.',
    panels,
    'Vary compositions to fit the product and story; avoid repetitive angles. Natural anatomy, coherent hands, realistic shadows and reflections, crisp product detail.',
    'Negative prompt: extra panels, missing panels, uneven grid, wrong branding, altered product, invented claims, distorted hands, extra fingers, inconsistent face, character swapping, text overlays, watermark, unrelated scenes.',
  ].filter(Boolean).join('\n\n')
}

function initialPanels(mode: StoryMode, style: string, idea: string, index: number): Panel[] {
  const progression = mode === 'Product Commercial'
    ? ['Open on a distinct, product-appropriate hero composition.', 'Reveal a new product perspective without changing its design.', 'Show one authentic visible material or feature detail.', 'Build a contrasting composition that clarifies the product form.', 'Add a restrained visual payoff suited to the selected style.', 'Finish on a premium, legible product hero.']
    : mode === 'Living Lifestyle'
      ? ['Establish the setting and the character’s everyday situation.', 'Introduce a natural first interaction with the product.', 'Show an authentic visible product detail in use.', 'Continue the character’s activity with realistic movement.', 'Develop the moment without repeating the same action.', 'End on a natural, attractive product-and-lifestyle frame.']
      : ['Open with an intriguing visual moment that fits the idea.', 'Establish the situation and setting.', 'Introduce the product naturally and accurately.', 'Develop the activity with a meaningful new beat.', 'Deliver the main visual payoff without exaggerated claims.', 'Resolve the moment with a compelling product-focused finish.']
  const productCameras = style.includes('Macro')
    ? ['Three-quarter hero detail', 'Top-down form study', 'Extreme material macro', 'Side profile with controlled reflection', 'Angled construction detail', 'Clean macro-to-hero composition']
    : style.includes('Unboxing')
      ? ['Closed package establishing frame', 'Overhead opening view', 'Close reveal detail', 'Three-quarter product inspection', 'Handheld in-use perspective', 'Open package and product hero']
      : style.includes('Fashion')
        ? ['Editorial full product portrait', 'Low-angle material detail', 'Profile with negative space', 'Walking follow frame', 'Confident three-quarter composition', 'Editorial campaign hero']
        : style.includes('Minimalist')
          ? ['Centered negative-space hero', 'Graphic overhead composition', 'Tight restrained detail', 'Balanced side profile', 'Minimal reflective composition', 'Symmetrical final hero']
          : ['Three-quarter hero composition', 'Distinct overhead perspective', 'Close authentic detail', 'Low profile with realistic reflections', 'Off-center environmental composition', 'Premium final hero composition']
  const lifestyleCameras = ['Wide environmental establishing frame', 'Medium over-the-shoulder interaction', 'Close product-use detail', 'Natural side-on activity frame', 'Moving follow composition', 'Warm character-and-product portrait']
  const storyCameras = ['Attention-grabbing composed opening', 'Wide setting reveal', 'Character-level product introduction', 'Purposeful medium action frame', 'Dynamic but plausible payoff angle', 'Quiet resolved hero frame']
  const cameraDirections = mode === 'Product Commercial' ? productCameras : mode === 'Living Lifestyle' ? lifestyleCameras : storyCameras
  const offset = index * 10
  return createTimeline().map((panel, panelIndex) => ({
    ...panel,
    description: `${progression[panelIndex]} ${index > 0 ? `Continue naturally from the prior ${offset}-second segment; do not restart the story.` : ''} ${idea.trim() ? `Honor this creative direction: ${idea.trim()}` : ''}`.trim(),
    camera: cameraDirections[panelIndex],
    action: ['Set the visual context', 'Introduce the next story beat', 'Show only visible product details', 'Continue the scene naturally', 'Deliver the payoff', 'Hold a clear final image'][panelIndex],
    dialogue: '',
  }))
}

function StoryboardGenerator({ onBack }: { onBack: () => void }) {
  const [idea, setIdea] = useState('')
  const [customStyle, setCustomStyle] = useState('')
  const [customLocation, setCustomLocation] = useState('')
  const [refs, setRefs] = useState<Partial<Record<ReferenceSlot, ReferenceImage>>>({})
  const [mode, setMode] = useState<StoryMode>('Product Commercial')
  const [style, setStyle] = useState<string>('Luxury Commercial')
  const [location, setLocation] = useState('Luxury Commercial Studio')
  const [duration, setDuration] = useState<PlanDuration | null>(null)
  const [audio, setAudio] = useState<AudioMode>('No Dialogue')
  const [language, setLanguage] = useState('Filipino / Taglish')
  const [customLanguage, setCustomLanguage] = useState('')
  const [customDialogue, setCustomDialogue] = useState('')
  const [music, setMusic] = useState(false)
  const [storyboards, setStoryboards] = useState<Storyboard[]>([])
  const [planApprovals, setPlanApprovals] = useState<Record<number, boolean>>({})
  const [planImagePrompts, setPlanImagePrompts] = useState<Record<number, string>>({})
  const [storyboardImages, setStoryboardImages] = useState<Record<number, string>>({})
  const [storyboardApprovals, setStoryboardApprovals] = useState<Record<number, boolean>>({})
  const [sceneImages, setSceneImages] = useState<Record<string, SceneImage>>({})
  const [imagePrompt, setImagePrompt] = useState('')
  const [videoPrompts, setVideoPrompts] = useState<Record<number, string>>({})
  const [current, setCurrent] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState('')
  const [explicitSettings, setExplicitSettings] = useState<Set<'mode' | 'style' | 'location' | 'audio'>>(new Set())
  const inputRefs = useRef<Partial<Record<ReferenceSlot, HTMLInputElement | null>>>({})
  const objectUrls = useRef<string[]>([])
  const revision = useRef(0)
  const storyCount = duration === null ? 0 : duration / 10
  const story = storyboards[current]
  const selectedLocation = location === 'Custom Location' ? customLocation.trim() || 'Custom location' : location

  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  function invalidate() {
    revision.current += 1
    setDuration(null)
    setStoryboards([])
    setPlanApprovals({})
    setPlanImagePrompts({})
    setStoryboardImages({})
    setStoryboardApprovals({})
    setSceneImages({})
    setImagePrompt('')
    setVideoPrompts({})
    setCurrent(0)
    setNotice('')
  }

  function updateSetting<T>(key: 'mode' | 'style' | 'location' | 'audio', setter: (value: T) => void, value: T) {
    setter(value)
    setExplicitSettings((previous) => new Set(previous).add(key))
    invalidate()
  }

  function uploadReference(slot: ReferenceSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose a valid image file for this reference.')
      return
    }
    const preview = URL.createObjectURL(file)
    objectUrls.current.push(preview)
    const previousPreview = refs[slot]?.preview
    if (previousPreview) {
      URL.revokeObjectURL(previousPreview)
      objectUrls.current = objectUrls.current.filter((url) => url !== previousPreview)
    }
    setRefs((previous) => ({ ...previous, [slot]: { file, preview } }))
    invalidate()
    setError('')
  }

  function removeReference(slot: ReferenceSlot) {
    const oldPreview = refs[slot]?.preview
    if (oldPreview) {
      URL.revokeObjectURL(oldPreview)
      objectUrls.current = objectUrls.current.filter((url) => url !== oldPreview)
    }
    setRefs((previous) => {
      const next = { ...previous }
      delete next[slot]
      return next
    })
    invalidate()
  }

  function context() {
    return {
      idea: idea.trim(),
      references: Object.fromEntries(Object.entries(refs).map(([slot, image]) => [slot, image?.file.name])),
      settings: {
        mode, style: style === 'Own Creative' ? `${style}: ${customStyle.trim()}` : style,
        location: selectedLocation,
        allowedDurationSeconds: allowedPlanDurations,
        durationPolicy: 'Automatically select the shortest suitable duration from 10, 20, or 30 seconds. Never exceed 30 seconds; do not add filler scenes.',
        audio, language: language === 'Custom Language' ? customLanguage.trim() : language,
        customDialogue: audio === 'Custom Dialogue' ? customDialogue : '',
        backgroundMusic: music,
        planningRules: [
          'Choose the shortest duration that naturally accommodates the idea, product actions, and dialogue.',
          'Never exceed 30 seconds. Do not add filler scenes to reach a longer duration.',
          'Return 1, 2, or 3 connected storyboards for 10, 20, or 30 seconds.',
          'Each storyboard contains exactly six distinct visual panels and exactly 10.0 seconds of contiguous timestamps from 0 to 10.',
          'Keep actions simple enough for their panel duration. Keep spoken dialogue natural and within about 15–22 words per 10-second storyboard.',
          'Preserve the exact supplied custom dialogue across the plan; do not remove or rewrite it.',
        ],
      },
      productIdentityLock: 'Uploaded product is authoritative. Preserve only visible product facts; never invent specifications, ingredients, medical claims, or performance guarantees.',
    }
  }

  async function requestJson(path: string, body: unknown) {
    const taskByPath: Record<string, string> = {
      '/storyboard/enhance-idea': 'storyboard-enhance-idea',
      '/storyboard/choose-settings': 'storyboard-choose-settings',
      '/storyboard/choose-audio': 'storyboard-choose-audio',
      '/storyboard/plan': 'storyboard-plan',
      '/storyboard/video-prompt': 'storyboard-video-prompt',
    }
    const task = taskByPath[path]
    if (!task) throw new Error('Unsupported Storyboard AI operation.')
    return requestAI(task, body)
  }

  async function requestWithReferences(path: string, prompt: string) {
    if (!storyboardApiBase) throw new Error('Configure VITE_UGC_AI_API_URL with your secure server-side AI backend to generate images.')
    const form = new FormData()
    form.append('prompt', prompt)
    form.append('context', JSON.stringify(context()))
    Object.entries(refs).forEach(([slot, ref]) => { if (ref) form.append(slot, ref.file) })
    const response = await fetch(`${storyboardApiBase}${path}`, { method: 'POST', body: form })
    if (!response.ok) throw new Error((await response.text()) || `AI service returned ${response.status}.`)
    return response.json() as Promise<Record<string, unknown>>
  }

  async function enhanceIdea() {
    if (!idea.trim()) {
      setError('Add a creative idea before asking the AI service to enhance it.')
      return
    }
    setBusy('enhance')
    setError('')
    const requestRevision = revision.current
    try {
      const result = await requestJson('/storyboard/enhance-idea', context())
      if (revision.current !== requestRevision) return
      if (typeof result.idea !== 'string' || !result.idea.trim()) throw new Error('The AI service response must include an idea string.')
      setIdea(result.idea)
      invalidate()
      setNotice('Idea enhanced by gpt-5-mini.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Idea enhancement failed.')
    } finally { setBusy('') }
  }

  async function chooseEverything() {
    setBusy('choose')
    setError('')
    const requestRevision = revision.current
    try {
      const result = await requestJson('/storyboard/choose-settings', {
        ...context(),
        allowedModes: modes.map((item) => item.name).filter((name) => name !== 'AI Choose Mode'),
        allowedStyles: styleOptions.map(([name]) => name).filter((name) => name !== 'AI Choose Style'),
        allowedLocations: locations.filter((name) => name !== 'AI Choose Location'),
      })
      if (revision.current !== requestRevision) return
      const choice = result.settings
      if (!choice || typeof choice !== 'object') throw new Error('AI service response must include a settings object.')
      const settings = choice as Record<string, unknown>
      const allowedMode = modes.find((item) => item.name === settings.mode && item.name !== 'AI Choose Mode')?.name
      const allowedStyle = styleOptions.find(([name]) => name === settings.style && name !== 'AI Choose Style')?.[0]
      const allowedLocation = locations.find((name) => name === settings.location && name !== 'AI Choose Location')
      if (!allowedMode || !allowedStyle || !allowedLocation) throw new Error('AI settings must provide a supported mode, style, and location.')
      if (!explicitSettings.has('mode') || mode === 'AI Choose Mode') setMode(allowedMode)
      if (!explicitSettings.has('style') || style === 'AI Choose Style') setStyle(allowedStyle)
      if (!explicitSettings.has('location') || location === 'AI Choose Location') setLocation(allowedLocation)
      invalidate()
      setNotice('gpt-5-mini filled missing creative settings. Your explicit choices and creative idea were preserved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI setting selection failed.')
    } finally { setBusy('') }
  }

  function buildPlanDraft(targetDuration: PlanDuration) {
    const chosenMode = mode === 'AI Choose Mode' ? 'Product Commercial' : mode
    const styleName = style === 'Own Creative' && customStyle.trim() ? `${style}: ${customStyle.trim()}` : style
    const dialogueWords = customDialogue.trim().split(/\s+/).filter(Boolean)
    const plans = Array.from({ length: targetDuration / 10 }, (_, index) => {
      const panels = initialPanels(chosenMode, styleName, idea, index)
      if (audio === 'Character Dialogue' && index === 0) panels[2].dialogue = 'Brief natural line in the selected language; one visible active speaker, accurate lip sync.'
      if (audio === 'Voiceover' && index === 0) panels[4].dialogue = 'Concise narration complements the product visuals; no lip-sync required.'
      if (audio === 'Custom Dialogue') {
        panels.forEach((panel, panelIndex) => {
          panel.dialogue = dialogueWords.slice(index * 22 + panelIndex * 4, index * 22 + panelIndex * 4 + 4).join(' ')
        })
      }
      return {
        title: `${styleName} · Storyboard ${index + 1}`,
        concept: `${idea.trim() || 'Product-led commercial concept'} · ${chosenMode}; visual style: ${styleName}. ${index > 0 ? `Continue the narrative from storyboard ${index}.` : ''}`,
        panels,
      }
    })
    if (!validStoryboardPlan(plans, targetDuration)) {
      setError('Could not assemble a valid local plan within the 30-second maximum.')
      return
    }
    setDuration(targetDuration)
    setStoryboards(plans)
    setPlanImagePrompts(Object.fromEntries(plans.map((item, index) => [
      index,
      imagePromptFor(item, index, chosenMode, styleName, selectedLocation, refs),
    ])))
    setPlanApprovals({})
    setStoryboardImages({})
    setStoryboardApprovals({})
    setSceneImages({})
    setImagePrompt('')
    setVideoPrompts({})
    setCurrent(0)
    setNotice(`Local duration estimate: ${targetDuration} seconds. Structured plan draft — not AI-generated and reference images have not been analyzed. Configure the backend for AI-directed planning.`)
  }

  async function generatePlan() {
    if (!refs.product) {
      setError('Upload the required product reference before creating a storyboard plan.')
      return
    }
    if (audio === 'Custom Dialogue' && !customDialogue.trim()) {
      setError('Enter your custom dialogue before creating the plan.')
      return
    }
    if (audio === 'Custom Dialogue' && countWords(customDialogue) > 66) {
      setError('The custom dialogue exceeds the 30-second maximum at a target of up to 22 words per 10-second storyboard. Shorten it before planning; no dialogue will be removed.')
      return
    }
    setDuration(null)
    setStoryboards([])
    setPlanApprovals({})
    setPlanImagePrompts({})
    setStoryboardImages({})
    setStoryboardApprovals({})
    setSceneImages({})
    setImagePrompt('')
    setVideoPrompts({})
    setCurrent(0)
    setNotice('')
    setBusy('plan')
    setError('')
    const requestRevision = revision.current
    try {
      const result: unknown = await requestJson('/storyboard/plan', context())
      if (revision.current !== requestRevision) return
      if (!result || typeof result !== 'object') {
        throw new Error('AI plan response must be an object containing durationSeconds and storyboards.')
      }
      const planResult = result as { durationSeconds?: unknown; storyboards?: unknown }
      if (!allowedPlanDurations.includes(planResult.durationSeconds as PlanDuration) || !Array.isArray(planResult.storyboards)) {
        throw new Error('AI plan must return durationSeconds of 10, 20, or 30 and a storyboards array.')
      }
      const selectedDuration = planResult.durationSeconds as PlanDuration
      const incoming = planResult.storyboards
      if (incoming.length !== selectedDuration / 10) throw new Error(`A ${selectedDuration}-second plan must contain exactly ${selectedDuration / 10} storyboards.`)
      const validated = incoming.map((item, index): Storyboard => {
        if (!item || typeof item !== 'object') throw new Error(`Storyboard ${index + 1} is invalid.`)
        const value = item as Record<string, unknown>
        if (typeof value.title !== 'string' || !value.title.trim() || typeof value.concept !== 'string' || !value.concept.trim() || !Array.isArray(value.panels)) throw new Error(`Storyboard ${index + 1} is missing its title, concept, or panels.`)
        const panels = value.panels.map((raw, panelIndex): Panel => {
          if (!raw || typeof raw !== 'object') throw new Error(`Storyboard ${index + 1}, panel ${panelIndex + 1} is invalid.`)
          const panel = raw as Record<string, unknown>
          if (typeof panel.start !== 'number' || typeof panel.end !== 'number' || typeof panel.description !== 'string' || typeof panel.camera !== 'string' || typeof panel.action !== 'string') {
            throw new Error(`Storyboard ${index + 1}, panel ${panelIndex + 1} is missing required fields.`)
          }
          if (!panel.description.trim() || !panel.camera.trim() || !panel.action.trim()) throw new Error(`Storyboard ${index + 1}, panel ${panelIndex + 1} must include a visual, camera direction, and action.`)
          return { start: panel.start, end: panel.end, description: panel.description, camera: panel.camera, action: panel.action, dialogue: typeof panel.dialogue === 'string' ? panel.dialogue : '' }
        })
        if (!isValidTimeline(panels)) throw new Error(`Storyboard ${index + 1} must have six contiguous panels from 0.0 to 10.0 seconds.`)
        return { title: value.title, concept: value.concept, panels }
      })
      if (!validStoryboardPlan(validated, selectedDuration)) {
        throw new Error('AI plan must contain six distinct, non-empty panels per storyboard; contiguous 10-second timelines; no more than 22 dialogue words per segment; and a total of exactly 10, 20, or 30 seconds.')
      }
      if (audio === 'Custom Dialogue') {
        const plannedDialogue = validated.flatMap((item) => item.panels.map((panel) => panel.dialogue)).join(' ').replace(/\s+/g, ' ').trim()
        const requestedDialogue = customDialogue.trim().replace(/\s+/g, ' ')
        if (!plannedDialogue.includes(requestedDialogue)) {
          throw new Error('The AI plan did not preserve the complete custom dialogue. Regenerate the plan; the user script was not shortened.')
        }
      }
      setDuration(selectedDuration)
      setStoryboards(validated)
      setPlanImagePrompts(Object.fromEntries(validated.map((item, index) => [
        index,
        imagePromptFor(item, index, mode, style, selectedLocation, refs),
      ])))
      setPlanApprovals({})
      setStoryboardImages({})
      setStoryboardApprovals({})
      setSceneImages({})
      setImagePrompt('')
      setVideoPrompts({})
      setCurrent(0)
      setNotice(`AI selected ${selectedDuration} seconds (${validated.length} connected storyboard${validated.length === 1 ? '' : 's'}). Total plan duration validated to exactly ${selectedDuration} seconds; review and approve the plan before image generation.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Storyboard planning failed.')
    } finally { setBusy('') }
  }

  function generateLocalPlanDraft() {
    if (!refs.product) {
      setError('Upload the required product reference before creating a storyboard plan.')
      return
    }
    if (audio === 'Custom Dialogue' && !customDialogue.trim()) {
      setError('Enter your custom dialogue before creating the plan.')
      return
    }
    if (audio === 'Custom Dialogue' && countWords(customDialogue) > 66) {
      setError('The custom dialogue exceeds the 30-second maximum at a target of up to 22 words per 10-second storyboard. Shorten it before planning; no dialogue will be removed.')
      return
    }
    setError('')
    buildPlanDraft(draftDuration(audio === 'Custom Dialogue' ? customDialogue : ''))
  }

  async function generateStoryboardImage() {
    if (!story || !planApprovals[current] || !isValidTimeline(story.panels)) {
      setError('Approve a valid six-panel storyboard plan before creating its image.')
      return
    }
    const prompt = imagePromptFor(story, current, mode, style, selectedLocation, refs)
    setImagePrompt(prompt)
    setStoryboardImages((previous) => {
      const next = { ...previous }
      delete next[current]
      return next
    })
    setStoryboardApprovals((previous) => ({ ...previous, [current]: false }))
    setSceneImages((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => !id.startsWith(`${current}-`))))
    setVideoPrompts((previous) => {
      const next = { ...previous }
      delete next[current]
      return next
    })
    setBusy('storyboard-image')
    setError('')
    const requestRevision = revision.current
    const storyboardIndex = current
    try {
      const result = await requestWithReferences('/storyboard/images', prompt)
      if (revision.current !== requestRevision) return
      const generatedUrl = imageUrl(result.imageUrl)
      setStoryboardImages((previous) => ({ ...previous, [storyboardIndex]: generatedUrl }))
      setStoryboardApprovals((previous) => ({ ...previous, [storyboardIndex]: false }))
      setNotice('Storyboard image returned by the configured image service. Review and approve it; it is not approved automatically.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Storyboard image generation failed.') }
    finally { setBusy('') }
  }

  async function generateSceneImage(panelIndex: number) {
    if (!story || !storyboardApprovals[current]) return
    const panel = story.panels[panelIndex]
    const prompt = `Generate an independent, professional vertical 9:16 photorealistic commercial scene image for storyboard ${current + 1}, panel ${panelIndex + 1}. ${panel.description} Camera: ${panel.camera}. Action: ${panel.action}. ${imagePromptFor(story, current, mode, style, selectedLocation, refs)} Preserve uploaded reference identity locks.`
    setBusy(`scene-${panelIndex}`)
    setError('')
    const requestRevision = revision.current
    const storyboardIndex = current
    try {
      const result = await requestWithReferences('/storyboard/scenes', prompt)
      if (revision.current !== requestRevision) return
      const generatedUrl = imageUrl(result.imageUrl)
      setSceneImages((previous) => ({ ...previous, [`${storyboardIndex}-${panelIndex}`]: { url: generatedUrl, approved: false } }))
      setVideoPrompts((previous) => { const next = { ...previous }; delete next[storyboardIndex]; return next })
      setNotice(`Independent 9:16 scene image ${panelIndex + 1} generated. Review and approve it explicitly.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Scene image generation failed.') }
    finally { setBusy('') }
  }

  function scenePrompt(panelIndex: number) {
    if (!story) return ''
    const panel = story.panels[panelIndex]
    return `Professional photorealistic vertical 9:16 commercial scene, storyboard ${current + 1} panel ${panelIndex + 1}. ${panel.description} Camera: ${panel.camera}. Action: ${panel.action}. Use @image1 as the authoritative exact product reference; preserve all visible branding, color, shape, proportions, packaging, and materials. ${refs.character ? 'Preserve the exact character reference identity.' : ''} ${refs.outfit ? 'Match the exact outfit reference.' : ''} ${refs.location ? 'Maintain the reference environment.' : selectedLocation}. Premium realistic light and color, natural anatomy, cohesive campaign continuity; no invented claims, text overlay, or watermark.`
  }

  async function createVideoPrompt(useLocalTemplate = false) {
    if (!story || duration === null || !validStoryboardPlan(storyboards, duration) || !storyboardApprovals[current]) {
      setError('Generate and approve the storyboard image before creating a video prompt.')
      return
    }
    const requestRevision = revision.current
    setError('')
    let chosenAudio = audio
    let audioRationale = ''
    if (audio === 'AI Choose Audio') {
      if (useLocalTemplate) {
        chosenAudio = story.panels.some((panel) => panel.dialogue.trim()) ? 'Character Dialogue' : 'No Dialogue'
        audioRationale = 'AI audio selection was skipped for the local prompt.'
      } else {
        setBusy('audio')
        try {
          const result = await requestJson('/storyboard/choose-audio', context())
          if (revision.current !== requestRevision) {
            setBusy('')
            return
          }
          if (result.mode !== 'No Dialogue' && result.mode !== 'Character Dialogue' && result.mode !== 'Voiceover') {
            throw new Error('AI audio recommendation must return No Dialogue, Character Dialogue, or Voiceover.')
          }
          chosenAudio = result.mode
          audioRationale = typeof result.rationale === 'string' ? result.rationale : ''
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'AI audio recommendation failed.')
          setBusy('')
          return
        }
        setBusy('')
      }
    }
    const timeline = story.panels.map((panel) =>
      `${panel.start.toFixed(1)}–${panel.end.toFixed(1)} seconds: ${panel.description} Camera: ${panel.camera}. Action: ${panel.action}${panel.dialogue ? ` Dialogue/voiceover: ${panel.dialogue}` : ''}`,
    ).join('\n')
    const globalStart = current * 10
    const approvedSeparateScenes = story.panels.every((_, index) => sceneImages[`${current}-${index}`]?.approved)
    const spokenLanguage = language === 'Custom Language' ? customLanguage : language
    const chosenDialogue = chosenAudio === 'No Dialogue'
      ? 'No spoken dialogue.'
      : chosenAudio === 'Custom Dialogue'
        ? current === 0
          ? `Use the supplied script verbatim; do not silently remove wording: “${customDialogue.trim()}”. Language: ${spokenLanguage}.`
          : 'No additional custom dialogue in this segment; the complete user script is assigned to storyboard 1 and is not repeated.'
        : chosenAudio === 'Voiceover'
          ? `Natural ${spokenLanguage} voiceover, concise and complementary to the visuals.`
          : `Brief natural ${spokenLanguage} dialogue; one clearly visible active speaker with accurate lip sync.`
    const prompt = [
      `VISUAL: One continuous, exactly 10-second planned commercial segment, storyboard ${current + 1} (${globalStart}–${globalStart + 10}s global campaign time), vertical 9:16. ${approvedSeparateScenes ? 'Use the six individually approved scene images as separate shots.' : 'Use the approved storyboard image as a visual reference only; do not assume a six-panel collage will become six separate shots. If the video service accepts only one starting image, use a compatible multi-shot/editing workflow and assemble the six moments in sequence.'} ${story.concept}`,
      `ACTION: Realistic, restrained movement that links six distinct moments. Do not restart the narrative or repeat product angles.`,
      `CAMERA: ${story.panels.map((panel) => panel.camera).join('; ')}. Plausible cuts and camera movement only.`,
      `DIALOGUE / VOICEOVER: ${chosenDialogue}`,
      `AUDIO: ${music ? 'Background music explicitly enabled; keep it subordinate to speech and natural product/environment sounds.' : 'No background music. Use realistic environmental and product sounds.'} Spoken-word target: approximately 15–22 words per 10 seconds when speech is used; preserve supplied custom dialogue and warn if it exceeds natural speaking time.`,
      `TIMELINE: Exactly six moments, no gaps or overlaps; local segment timeline starts at 0.0 and ends at exactly 10.0 seconds. ${timeline} This segment is storyboard ${current + 1} of ${storyCount}; its global campaign offset is ${globalStart} seconds. A text prompt cannot guarantee rendered duration. Request native 10 seconds if supported; otherwise trim/edit the generated output to the 10-second segment.`,
      'PRODUCT IDENTITY LOCK: @image1 is authoritative; do not redesign it or invent product specifications, ingredients, claims, or results.',
      `CHARACTER IDENTITY LOCK: ${refs.character ? 'Preserve @image2 identity, face, hair, skin tone, proportions, and accessories; realistic anatomy.' : 'Keep any depicted person consistent throughout.'}`,
      `OUTFIT CONTINUITY LOCK: ${refs.outfit ? 'Preserve @image3 visible outfit exactly.' : 'Maintain consistent wardrobe throughout.'}`,
      `LOCATION CONTINUITY LOCK: ${refs.location ? 'Maintain @image4 location continuity.' : `Maintain one coherent ${selectedLocation} environment.`}`,
      'Never claim the video service rendered an exact duration unless its output was measured. If separate approved scene images are available, use them in order. Otherwise use the approved storyboard as reference only and render/assemble shots separately when the service cannot accept multi-shot instructions.',
    ].join('\n\n')
    if (useLocalTemplate) {
      setVideoPrompts((previous) => ({ ...previous, [current]: prompt }))
      setNotice(`Local video prompt — not AI-generated. ${audioRationale || ''} No video was rendered.`)
      return
    }
    setBusy('video-prompt')
    try {
      const result = await requestJson('/storyboard/video-prompt', { ...context(), draftPrompt: prompt })
      if (revision.current !== requestRevision) return
      if (typeof result.prompt !== 'string' || !result.prompt.trim()) {
        throw new Error('AI video-prompt response did not contain a "prompt" string.')
      }
      const generatedPrompt = result.prompt
      const requiredSections = ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:', 'TIMELINE:']
      if (!requiredSections.every((section) => generatedPrompt.includes(section))) {
        throw new Error('AI video prompt omitted one or more required direction sections. Try again or use the local prompt.')
      }
      if (audio === 'Custom Dialogue' && current === 0 && !generatedPrompt.includes(customDialogue.trim())) {
        throw new Error('The AI video prompt did not preserve the complete custom dialogue. Use the local prompt or try again.')
      }
      setVideoPrompts((previous) => ({ ...previous, [current]: generatedPrompt }))
      setNotice(`Video prompt generated by gpt-5-mini. ${audioRationale ? `AI audio recommendation: ${chosenAudio}. ${audioRationale} ` : ''}No video was rendered.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Video prompt generation failed.')
    } finally {
      setBusy('')
    }
  }

  async function copyText(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      window.setTimeout(() => setCopied(''), 1600)
    } catch { setError('Could not copy to clipboard. Check browser clipboard permissions.') }
  }

  const downloadLink = (url: string, fileName: string, label: string) => (
    <a className="story-download" href={url} download={fileName} target="_blank" rel="noreferrer">{label}</a>
  )
  const cardGroup = (items: readonly string[] | readonly { name: string; detail: string }[], selected: string, onSelect: (name: string) => void) => (
    <div className="story-choice-grid">
      {items.map((item) => {
        const name = typeof item === 'string' ? item : item.name
        const detail = typeof item === 'string' ? '' : item.detail
        return <button key={name} type="button" className={`story-choice ${selected === name ? 'selected' : ''}`} aria-pressed={selected === name} onClick={() => onSelect(name)}><strong>{name}</strong>{detail && <span>{detail}</span>}</button>
      })}
    </div>
  )
  const section = (step: string, title: string, children: ReactNode) => (
    <section className="story-section" id={`story-${step}`}><div className="story-section-heading"><span>{step}</span><h2>{title}</h2></div>{children}</section>
  )

  return (
    <section className="story-workspace">
      <button className="back-link" onClick={onBack}><span aria-hidden="true">←</span> ALL GENERATORS</button>
      <div className="story-heading"><div className="story-kicker">AFFILIATE COMMERCIAL PRODUCTION · V4.2</div><h1>Universal Affiliate <em>Storyboard AI</em></h1><p>Plan a connected, image-first commercial for TikTok Shop, Shopee, Reels, and product advertising.</p></div>
      <nav className="story-progress" aria-label="Storyboard workflow progress">{['Idea', 'References', 'Mode', 'Style', 'Location', 'Audio', 'Plan', 'Storyboard Image', 'Scene Approval', 'Video Prompt'].map((label, index) => <a key={label} href={`#story-${String(index + 1).padStart(2, '0')}`}><i>{String(index + 1).padStart(2, '0')}</i>{label}</a>)}</nav>

      {section('01', 'YOUR CREATIVE IDEA (OPTIONAL)', <>
        <textarea className="story-textarea" value={idea} onChange={(event) => { setIdea(event.target.value); invalidate() }} placeholder="Describe your commercial idea here... Or leave this blank and let AI create everything for you." rows={3} aria-label="Your creative idea (optional)" />
        <div className="story-actions"><button className="story-primary" onClick={enhanceIdea} disabled={!!busy}>{busy === 'enhance' ? 'ENHANCING…' : 'ENHANCE MY IDEA'}</button><button className="story-secondary" onClick={chooseEverything} disabled={!!busy}>{busy === 'choose' ? 'CHOOSING…' : 'AI CHOOSE EVERYTHING'}</button></div>
        <p className="story-help">AI text uses the secure /api/generate endpoint with gpt-5-mini. Uploaded reference images stay in the browser for preview and are not analyzed by AI.</p>
      </>)}

      {section('02', 'REFERENCE IMAGE UPLOADS', <>
        <div className="story-upload-grid">{slotDetails.map(({ slot, title, label, help }) => <article className={`story-upload ${refs[slot] ? 'has-image' : ''}`} key={slot}>
          <input ref={(element) => { inputRefs.current[slot] = element }} className="story-file-input" type="file" accept="image/*" onChange={(event) => uploadReference(slot, event)} aria-label={`Upload ${title}`} />
          {refs[slot] ? <img className="story-upload-preview" src={refs[slot]?.preview} alt={`${title} preview`} /> : <div className="story-upload-empty" aria-hidden="true">＋</div>}
          <div className="story-upload-copy"><strong>{title}</strong><small>{label}</small><p>{help}</p></div>
          <div className="story-actions"><button className="story-secondary" onClick={() => inputRefs.current[slot]?.click()}>{refs[slot] ? 'REPLACE' : 'UPLOAD IMAGE'}</button>{refs[slot] && <button className="story-remove" onClick={() => removeReference(slot)}>REMOVE</button>}</div>
          {refs[slot] && <small className="story-file-name">{refs[slot]?.file.name}</small>}
        </article>)}</div>
        <p className="story-help">Uploads are previews until sent to a configured service. The app does not claim to have analyzed image contents without backend image-analysis capability.</p>
      </>)}

      {section('03', 'STORYBOARD MODE', cardGroup(modes.map(({ name }) => name), mode, (value) => updateSetting('mode', setMode, value as StoryMode)))}
      {section('04', 'STORYBOARD STYLE', <>
        <div className="story-choice-grid story-style-grid">{styleOptions.map(([name]) => <button key={name} type="button" className={`story-choice story-style ${style === name ? 'selected' : ''}`} aria-pressed={style === name} onClick={() => updateSetting('style', setStyle, name)}><strong>{name}</strong></button>)}</div>
        {style === 'Own Creative' && <label className="story-field">OWN CREATIVE CONCEPT<textarea value={customStyle} onChange={(event) => { setCustomStyle(event.target.value); invalidate() }} placeholder="Describe the specific visual concept..." rows={2} /></label>}
      </>)}
      {section('05', 'BACKGROUND / LOCATION', <>
        {cardGroup(locations, location, (value) => updateSetting('location', setLocation, value))}
        {location === 'Custom Location' && <label className="story-field">CUSTOM LOCATION<input value={customLocation} onChange={(event) => { setCustomLocation(event.target.value); invalidate() }} placeholder="Describe the environment..." /></label>}
      </>)}
      {section('06', 'DIALOGUE / AUDIO MODE', <>
        {cardGroup(audioModes.map(({ name }) => name), audio, (value) => updateSetting('audio', setAudio, value as AudioMode))}
        {audio !== 'No Dialogue' && <div className="story-inline-fields">
          <label className="story-field">LANGUAGE<select value={language} onChange={(event) => { setLanguage(event.target.value); invalidate() }}><option>Filipino / Taglish</option><option>English</option><option>Custom Language</option></select></label>
          {language === 'Custom Language' && <label className="story-field">CUSTOM LANGUAGE<input value={customLanguage} onChange={(event) => { setCustomLanguage(event.target.value); invalidate() }} placeholder="Specify language..." /></label>}
          {audio === 'Custom Dialogue' && <label className="story-field story-field-wide">CUSTOM DIALOGUE<textarea value={customDialogue} onChange={(event) => { setCustomDialogue(event.target.value); invalidate() }} rows={3} placeholder="Enter the exact spoken script..." /><small>{countWords(customDialogue)} words entered · target up to 22 words per 10-second storyboard (30 seconds maximum).</small></label>}
        </div>}
        {audio === 'Custom Dialogue' && countWords(customDialogue) > 66 && <p className="story-warning" role="status">This script exceeds the 30-second maximum at a target of up to 22 words per segment. It will not be shortened automatically.</p>}
        <label className="story-music"><input type="checkbox" checked={music} onChange={(event) => { setMusic(event.target.checked); invalidate() }} /> Enable background music (off by default)</label>
      </>)}

      {section('07', 'AI STORYBOARD PLAN', <>
        <div className="story-actions"><button className="story-primary" onClick={generatePlan} disabled={!!busy}>{busy === 'plan' ? 'GENERATING AI PLAN…' : 'GENERATE AI STORYBOARD PLAN'}</button><button className="story-secondary" onClick={generateLocalPlanDraft} disabled={!!busy}>USE LOCAL DRAFT · NOT AI</button>{story && <button className={`story-secondary ${planApprovals[current] ? 'is-approved' : ''}`} disabled={!isValidTimeline(story.panels)} onClick={() => { setPlanApprovals((previous) => ({ ...previous, [current]: true })); setNotice('Plan approved. Storyboard image generation is now available.') }}>{planApprovals[current] ? 'PLAN APPROVED ✓' : 'APPROVE STORYBOARD PLAN'}</button>}</div>
        <p className="story-help">The AI plan uses your text idea and settings only; uploaded reference images are not analyzed. If AI is unavailable, use the clearly labeled local draft.</p>
        {storyboards.length > 0 && duration !== null && <>
          <p className="story-notice"><strong>SELECTED DURATION · {duration} SECONDS</strong><br />{storyboards.length} connected storyboard{storyboards.length === 1 ? '' : 's'} · {storyboards.length * 6} panels · exactly {duration} seconds planned.</p>
          {cardGroup(storyboards.map((item, index) => ({ name: `Storyboard ${index + 1}`, detail: `${index * 10}–${(index + 1) * 10} seconds · ${item.title}` })), story ? `Storyboard ${current + 1}` : '', (value) => { const index = Number(value.split(' ')[1]) - 1; if (index < storyboards.length) { setCurrent(index); setImagePrompt('') } })}
        </>}
        {storyboards.map((item, index) => <article className="story-plan-card" key={`plan-${index}`}>
          <div className="story-plan-title"><span>STORYBOARD {index + 1} / {storyCount} · GLOBAL TIMELINE {(index * 10).toFixed(1)}–{((index + 1) * 10).toFixed(1)} SECONDS</span><h3>{item.title}</h3><p>{item.concept}</p></div>
          {!isValidTimeline(item.panels) && <p className="story-warning">Timeline invalid: six contiguous moments must begin at 0 and end at exactly 10 seconds.</p>}
          <p className="story-help">Six distinct panels are preserved in the approved storyboard plan with a validated 0.0–10.0 second continuous timeline.</p>
          <label className="story-field">COMPLETE IMAGE PROMPT<textarea className="story-prompt-box" value={planImagePrompts[index] ?? ''} readOnly rows={12} aria-label={`Complete image prompt for storyboard ${index + 1}`} /></label>
          <div className="story-actions"><button className="story-secondary" onClick={() => void copyText(planImagePrompts[index] ?? '', `plan-image-prompt-${index}`)}>{copied === `plan-image-prompt-${index}` ? 'COPIED ✓' : 'COPY IMAGE PROMPT'}</button>{index === current && <button className={`story-secondary ${planApprovals[current] ? 'is-approved' : ''}`} disabled={!isValidTimeline(item.panels)} onClick={() => { setPlanApprovals((previous) => ({ ...previous, [current]: true })); setNotice('Plan approved. Storyboard image generation is now available.') }}>{planApprovals[current] ? 'PLAN APPROVED ✓' : 'APPROVE THIS STORYBOARD PLAN'}</button>}</div>
        </article>)}
      </>)}

      {section('08', 'STORYBOARD IMAGE GENERATION', <>
        {story && <><textarea className="story-textarea story-prompt-box" value={imagePrompt || imagePromptFor(story, current, mode, style, selectedLocation, refs)} readOnly aria-label="Storyboard image prompt" />
          <div className="story-actions"><button className="story-secondary" onClick={() => setImagePrompt(imagePromptFor(story, current, mode, style, selectedLocation, refs))}>GENERATE IMAGE PROMPT</button><button className="story-secondary" onClick={() => void copyText(imagePrompt || imagePromptFor(story, current, mode, style, selectedLocation, refs), 'image-prompt')}>{copied === 'image-prompt' ? 'COPIED ✓' : 'COPY IMAGE PROMPT'}</button><button className="story-primary" onClick={generateStoryboardImage} disabled={!planApprovals[current] || !!busy}>{busy === 'storyboard-image' ? 'GENERATING…' : 'CREATE STORYBOARD IMAGE'}</button></div>
          {!storyboardApiBase && <p className="story-help">Image generation unavailable: configure VITE_UGC_AI_API_URL and implement POST /storyboard/images. This app will not show fake generated images.</p>}
        </>}
        {storyboardImages[current] && <div className="story-generated-image"><img src={storyboardImages[current]} alt={`Generated storyboard ${current + 1}`} /><div className="story-actions"><button className={`story-secondary ${storyboardApprovals[current] ? 'is-approved' : ''}`} onClick={() => { setStoryboardApprovals((previous) => ({ ...previous, [current]: true })); setVideoPrompts((previous) => { const next = { ...previous }; delete next[current]; return next }); setNotice('Storyboard image approved. Video prompt generation is now unlocked.') }} disabled={storyboardApprovals[current] || !!busy}>{storyboardApprovals[current] ? 'APPROVED' : 'APPROVE'}</button><button className="story-secondary" onClick={() => void generateStoryboardImage()} disabled={!!busy}>{busy === 'storyboard-image' ? 'REGENERATING…' : 'REGENERATE'}</button></div></div>}
      </>)}

      {story && storyboardApprovals[current] && <details className="story-advanced-scenes">
        <summary>ADVANCED · INDIVIDUAL SCENE IMAGES</summary>
        <div className="story-scene-grid">{story.panels.map((panel, index) => {
          const key = `${current}-${index}`
          const scene = sceneImages[key]
          return <article className="story-scene-card" key={key}><strong>SCENE {index + 1} · {(current * 10 + panel.start).toFixed(1)}–{(current * 10 + panel.end).toFixed(1)}s</strong>{scene && <img src={scene.url} alt={`Scene ${index + 1}`} />}
            <p>{panel.description}</p><button className="story-secondary" onClick={() => void copyText(scenePrompt(index), `scene-prompt-${index}`)}>{copied === `scene-prompt-${index}` ? 'PROMPT COPIED ✓' : 'COPY SCENE IMAGE PROMPT'}</button>
            <button className="story-primary" onClick={() => void generateSceneImage(index)} disabled={!!busy}>{busy === `scene-${index}` ? 'GENERATING…' : scene ? 'REGENERATE SCENE IMAGE' : 'GENERATE SCENE IMAGE'}</button>
            {scene && <><button className={`story-secondary ${scene.approved ? 'is-approved' : ''}`} onClick={() => { setSceneImages((previous) => ({ ...previous, [key]: { ...scene, approved: !scene.approved } })); setVideoPrompts((previous) => { const next = { ...previous }; delete next[current]; return next }) }}>{scene.approved ? 'SCENE APPROVED ✓' : 'APPROVE SCENE IMAGE'}</button>{downloadLink(scene.url, `storyboard-${current + 1}-scene-${index + 1}.png`, 'DOWNLOAD SCENE IMAGE')}</>}
          </article>
        })}</div>
      </details>}

      {section('10', 'VIDEO PROMPT GENERATION', <>
        <div className="story-actions"><button className="story-primary" onClick={() => void createVideoPrompt()} disabled={!story || !!busy || !storyboardApprovals[current]}>{busy === 'audio' ? 'CHOOSING AUDIO…' : busy === 'video-prompt' ? 'GENERATING AI PROMPT…' : 'GENERATE AI VIDEO PROMPT'}</button><button className="story-secondary" onClick={() => void createVideoPrompt(true)} disabled={!story || !!busy || !storyboardApprovals[current]}>USE LOCAL PROMPT · NOT AI</button></div>
        {videoPrompts[current] && <><textarea className="story-textarea story-video-output" value={videoPrompts[current]} readOnly rows={20} aria-label="Generated video prompt" /><div className="story-actions"><button className="story-secondary" onClick={() => void copyText(videoPrompts[current], 'video')}>{copied === 'video' ? 'COPIED ✓' : 'COPY VIDEO PROMPT'}</button>{current + 1 < storyCount && <button className="story-primary" onClick={() => { setCurrent(current + 1); setImagePrompt('') }} disabled={!videoPrompts[current]}>GENERATE NEXT STORYBOARD</button>}</div><p className="story-help">One storyboard is a 10-second planned segment. Rendering length depends on the connected video service; request native 10 seconds or trim/edit to duration.</p></>}
      </>)}

      {notice && <p className="story-notice" role="status">{notice}</p>}
      {error && <p className="story-error" role="alert">{error}</p>}
      <footer className="story-footer">UNIVERSAL / AFFILIATE STORYBOARD STUDIO <span>{storyboards.length ? `${storyboards.length} CONNECTED SEGMENTS` : 'IMAGE-FIRST · USER APPROVAL REQUIRED'}</span></footer>
    </section>
  )
}

export default StoryboardGenerator
