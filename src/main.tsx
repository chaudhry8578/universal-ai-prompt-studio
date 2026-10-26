import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
import StoryboardGenerator from './StoryboardGenerator'
import AdminDashboard from './AdminDashboard'
import AdminBootstrapPage, { isAdminBootstrapLocation } from './AdminBootstrapPage'
import AuthPage, { isAuthUser } from './AuthPage'
import type { AuthUser, AuthView, Credits } from './AuthPage'
import { requestAI } from './ai'
import { readJsonResponse } from './api-response'
import './styles.css'

type Generator = {
  id: string
  number: string
  name: string
  title: string
  description: string
  image: string
  tag: string
  promptLead: string
}

const generators: Generator[] = [
  {
    id: 'ugc',
    number: '01',
    name: 'UGC GENERATOR',
    title: 'Make it feel real.',
    description: 'Creator-led product stories with a natural point of view.',
    image: 'photo-1534528741775-53994a69daeb',
    tag: 'CREATOR CONTENT',
    promptLead: 'Create a natural UGC video featuring',
  },
  {
    id: 'faceless',
    number: '02',
    name: 'FACELESS GENERATOR',
    title: 'Let the story lead.',
    description: 'Scroll-stopping visuals, voiceover, and product moments.',
    image: 'photo-1470252649378-9c29740c9fa8',
    tag: 'VOICEOVER + VISUALS',
    promptLead: 'Create a faceless short-form video about',
  },
  {
    id: 'drama',
    number: '03',
    name: 'AI.DRAMA STORY',
    title: 'A little more drama.',
    description: 'Cinematic characters, high stakes, and an impossible hook.',
    image: 'photo-1519608487953-e999c86e7455',
    tag: 'CINEMATIC STORY',
    promptLead: 'Write a dramatic, cinematic short-form story about',
  },
  {
    id: 'storyboard',
    number: '04',
    name: 'STORYBOARD',
    title: 'See every scene.',
    description: 'Break an idea into a shoot-ready sequence of frames.',
    image: 'photo-1485846234645-a62644f84728',
    tag: 'SHOT BY SHOT',
    promptLead: 'Storyboard a short-form video about',
  },
]

const hyunaStoryMasterPrompt = `HYUNA STORY — NEW MASTER PROMPT RULES

1. Ask if Anong story ang gagawin.

NO ON-SCREEN TEXT LOCK
/NoOnScreenText
/NoSubtitles
/NoCaptions
/NoTextOverlays
/NoWatermarks
/NoRandomLetters
/NoFloatingText

- Bawal ang anumang unnecessary text sa image at video.
- EXCEPTION: Kapag may text message, chat conversation, o phone notification na importante sa kwento, dapat visible at readable ang actual message sa phone screen.
- Walang subtitles kahit may dialogue.
- Natural cinematic visuals only.

2. EVERY 20 SECONDS — NEW EVENT & LOCATION

/ChangeEventEvery20Seconds
/ChangeLocationEvery20Seconds
/NewActionEvery20Seconds
/ContinuousStoryProgression
/LogicalSceneTransitions
/NoRandomStoryJumps

- Bawat scene ay 10 seconds.
- Every 2 scenes (20 seconds), magbabago ang location at pangunahing pangyayari.
- Scene 1–2: Same location, connected actions.
- Scene 3–4: New location, new event.
- Scene 5–6: New location, next story development.
- Hindi paulit-ulit ang ginagawa ng characters.
- Bawat bagong pangyayari ay dapat may connection sa previous scene.
- Natural ang paglipat ng location, may malinaw na dahilan kung bakit lumipat ang characters.
- Hindi minamadali ang story development.

3. CHARACTER & STORY CONTINUITY LOCK

/CharacterIdentityLock
/CharacterOutfitLock
/CharacterVoiceLock
/StoryContinuityLock
/PreviousSceneMemory
/RealisticSceneTransitions
/NoFaceMorphing
/NoCharacterSwapping

- Same faces, hairstyles, voices, and accessories.
- Outfits remain consistent unless may logical wardrobe change.
- May consequences ang actions at dialogue sa previous scenes.
- Walang biglang pagbabago ng personality o relationship.
- Laging may beginning, middle, climax, at ending.

4. VIDEO PRODUCTION LOCK
   Always may /command sa video prompt

   /Speak character only 1-2 person on the screen only
   /Video10Seconds
   /Vertical9:16
   /AllCameraMovementCompatible
   /NaturalKalyeDialogue
   /Taglish70PercentTagalog30PercentEnglish
   /Dialog20-25WordsMaximum
   /AccurateLipSync
   /RealisticFacialExpressions
   /NaturalBodyMovement
   /LightingQuality8K
   /NoBackgroundMusic
   /NaturalAmbientSounds
   /NoTimestamps
   /SingleImageReferencePerScene

   /SpeakingCharacterVisibilityLock /Maximum2VisibleCharacters /ActiveSpeakerLipSyncOnly /NoDialogueSwapping /NoExtraVisibleCharacters /CharacterVoiceLock

   GOAL: Gumawa ng entertaining Filipino AI movie na bawat 20 seconds ay may bagong pangyayari at lugar, pero tuloy-tuloy, natural, at madaling sundan ang buong kwento.


   ---

   5EPISODE & STORY STRUCTURE LOCK
   /15ScenesPerEpisode
   /10EpisodesPerStory
   /10SecondsPerScene
   /150ScenesTotal
   /CliffhangerEveryEpisode
   /StrongEpisodeEnding
   /ContinuousStoryProgression
   /NoUnnecessaryFiller
   /FinalEpisodeStoryResolution

   - Every episode must contain exactly 15 scenes.
   - Every complete story must contain exactly 10 episodes (150 scenes total).
   - Every scene lasts exactly 10 seconds.
   - Each episode lasts 2 minutes and 30 seconds.
   - Scene 15 of Episodes 1–9 must end with a powerful cliffhanger, shocking revelation, emotional twist, betrayal, or suspense that makes viewers excited for the next episode.
   - Build suspense naturally throughout the episode. Do not rush the story or introduce random twists.
   - Episode 10 must deliver the final climax, resolve the main conflicts, and provide a satisfying ending. No Episode 11.

   6. ONE-CLICK WORKFLOW LOCK
      /AlwaysIncludeSlashCommands
         /CreateImageButtonAfterImagePrompt
            /CopyVideoPromptButtonAfterVideoPrompt
               /OneSceneAtATime
                  /WaitForApprovedImage

                  - Always include the appropriate /commands in every video prompt.
                  - After every image prompt, display a clickable button labeled "Create Image" that submits the approved scene image-generation request directly in ChatGPT.
                  - After every video prompt, display a clickable button labeled "Copy Video Prompt" that copies the entire Google Flow video prompt, including all /commands, Visual, Action, Camera, Dialogue and Audio.
                  - Follow the workflow: Image Prompt → Create Image → Approved Image → Video Prompt → Copy Video Prompt → Next Scene.
                  - Never skip image approval before creating the video prompt.
                  - Keep every scene prompt concise and ready to use.
                    —-------------------------------------
                      SINGLE IMAGE GENERATION LOCK

                      /SingleImageOnly /NoStoryboardLayout /NoCollage /NoSplitScreen /NoMultiPanel /OneSceneOneImage /SingleCinematicFrame /Vertical9x16 /FullFrameComposition /NoBorders /NoGridLayout

                      - Generate exactly ONE full-frame cinematic image per scene.
                      - NEVER create a storyboard, collage, contact sheet, split-screen, grid, or multiple panels.
                      - Do not combine multiple camera angles, moments, or actions in one image.
                      - Each image must show only ONE specific moment from the current scene.
                      - Use one continuous vertical 9:16 composition filling the entire image.
                      - Preserve character identity, outfit, location, and visual continuity.
                      - Do not add text, captions, labels, borders, or watermarks.
                      - Even when the user requests a storyboard-style story, generate only ONE individual scene image at a time.
                      - Wait for image approval before generating the video prompt.

                      Ayan wag mo babaguhin`

const homepagePandaImages = {
  portrait: '/images/file_00000000c5e08211873d150d4db39bde.png',
  studio: '/images/file_00000000cd5482119047ced75a741b53.png',
}

const generatorPandaImages: Record<Generator['id'], string> = {
  ugc: homepagePandaImages.portrait,
  faceless: homepagePandaImages.studio,
  drama: homepagePandaImages.portrait,
  storyboard: homepagePandaImages.studio,
}

type UploadSlot = 'character' | 'outfit' | 'product'

type UGCSettings = {
  duration: string
  gender: string
  ageMode: string
  age: string
  location: string
  customLocation: string
  niche: string
  action: string
  customAction: string
  style: string
  shotPlan: string
  dialogue: string
  manualDialogue: string
  cameraAngles: string[]
  cameraMovement: string
  notes: string
}

const initialUGCSettings: UGCSettings = {
  duration: '15 seconds',
  gender: 'Auto',
  ageMode: 'Auto',
  age: '',
  location: 'Bedroom',
  customLocation: '',
  niche: 'Auto',
  action: 'Review',
  customAction: '',
  style: 'Natural Filipino UGC',
  shotPlan: 'Auto',
  dialogue: 'None',
  manualDialogue: '',
  cameraAngles: ['Eye-level'],
  cameraMovement: 'Auto-natural',
  notes: '',
}

const ugcImageEndpoint = import.meta.env.VITE_UGC_IMAGE_ENDPOINT ||
  (import.meta.env.VITE_UGC_AI_API_URL ? `${import.meta.env.VITE_UGC_AI_API_URL.replace(/\/$/, '')}/images` : '')

type UGCImage = { file: File; preview: string }
type UGCClip = { title: string; duration: number; prompt: string }

function UGCWorkspace() {
  const [brief, setBrief] = useState('')
  const [uploads, setUploads] = useState<Partial<Record<UploadSlot, UGCImage>>>({})
  const [generatedImage, setGeneratedImage] = useState<UGCImage | null>(null)
  const [generatedImageUrl, setGeneratedImageUrl] = useState('')
  const [changeRequest, setChangeRequest] = useState('')
  const [requestingChanges, setRequestingChanges] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [clips, setClips] = useState<UGCClip[]>([])
  const [approved, setApproved] = useState(false)
  const [settings, setSettings] = useState<UGCSettings>(initialUGCSettings)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState('')
  const objectUrls = useRef<string[]>([])
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function clearLaterStages() {
    setImagePrompt('')
    setGeneratedImage(null)
    setGeneratedImageUrl('')
    setApproved(false)
    setClips([])
    setNotice('')
    setRequestingChanges(false)
    setChangeRequest('')
  }

  function updateSetting<K extends keyof UGCSettings>(key: K, value: UGCSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
    clearLaterStages()
  }

  function handleReferenceUpload(slot: UploadSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const preview = URL.createObjectURL(file)
    objectUrls.current.push(preview)
    setUploads((current) => ({ ...current, [slot]: { file, preview } }))
    clearLaterStages()
  }

  function removeReference(slot: UploadSlot) {
    setUploads((current) => {
      const next = { ...current }
      delete next[slot]
      return next
    })
    clearLaterStages()
  }

  function readImageFile(file: File) {
    const preview = URL.createObjectURL(file)
    objectUrls.current.push(preview)
    return { file, preview }
  }

  function buildImagePrompt() {
    const referenceLocks = [
      uploads.character && 'Use @image1 as the exact character identity reference; preserve facial identity and distinctive features.',
      uploads.outfit && 'Use @image2 as the exact outfit reference; preserve garment design, colors, and styling.',
      uploads.product && 'Use @image3 as the exact product reference; preserve packaging, label placement, shape, and colors.',
    ].filter(Boolean).join(' ')
    return [
      `Create a photorealistic vertical 9:16 UGC still for a ${settings.duration} ${settings.style} video.`,
      `Creative idea: ${brief.trim()}.`,
      `Character: ${settings.gender === 'Auto' ? 'natural and suitable to the product' : settings.gender.toLowerCase()}${settings.ageMode === 'Manual age' && settings.age ? `, age ${settings.age}` : ''}.`,
      `Location: ${settings.location === 'Custom' ? settings.customLocation || 'a realistic custom location' : settings.location}. Product niche: ${settings.niche}.`,
      `Depict a believable ${(settings.action === 'Custom' ? settings.customAction : settings.action).toLowerCase()} moment with natural Filipino creator energy, realistic skin texture, tactile product detail, coherent hands and packaging, candid expression, soft practical lighting, and a lived-in composition.`,
      referenceLocks,
      `Maintain a clean frame: no text, subtitles, logos added beyond real product packaging, or watermark. Notes: ${settings.notes || 'none'}.`,
    ].filter(Boolean).join(' ')
  }

  async function generateImagePrompt(useLocalTemplate = false) {
    if (!brief.trim()) return
    setBusy('image-prompt')
    setError('')
    clearLaterStages()
    try {
      if (useLocalTemplate) {
        setImagePrompt(buildImagePrompt())
        setNotice('Local prompt template — not AI-generated. Uploaded reference images were not analyzed.')
      } else {
        const result = await requestAI('ugc-image-prompt', {
          brief: brief.trim(),
          settings,
          referenceNames: Object.fromEntries(Object.entries(uploads).map(([key, image]) => [key, image?.file.name])),
        })
        if (typeof result.prompt !== 'string' || !result.prompt.trim()) throw new Error('AI image-prompt response did not contain a "prompt" string.')
        setImagePrompt(result.prompt)
        setNotice('Generated by gpt-5-mini. Uploaded reference images were not analyzed.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate an image prompt.')
    } finally {
      setBusy('')
    }
  }

  async function createImage() {
    if (!imagePrompt || !ugcImageEndpoint) return
    setBusy('image')
    setError('')
    try {
      const form = new FormData()
      form.append('prompt', changeRequest.trim() ? `${imagePrompt}\nRequested image changes: ${changeRequest.trim()}` : imagePrompt)
      form.append('changeRequest', changeRequest)
      form.append('settings', JSON.stringify(settings))
      Object.entries(uploads).forEach(([slot, image]) => {
        if (image) form.append(slot, image.file)
      })
      const response = await fetch(ugcImageEndpoint, { method: 'POST', body: form })
      if (!response.ok) throw new Error((await response.text()) || `Image service returned ${response.status}.`)
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object') throw new Error('Image service returned an unexpected response.')
      const imageResult = result as Record<string, unknown>
      if (typeof imageResult.imageUrl !== 'string' || !imageResult.imageUrl.trim()) throw new Error('Image service response did not contain an "imageUrl".')
      setGeneratedImage(null)
      setGeneratedImageUrl(imageResult.imageUrl)
      setApproved(false)
      setNotice('Image generated by the configured image service. Review it before approval.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate an image.')
    } finally {
      setBusy('')
    }
  }

  function handleGeneratedImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file to continue.')
      return
    }
    setGeneratedImage(readImageFile(file))
    setGeneratedImageUrl('')
    setApproved(false)
    setClips([])
    setError('')
    setNotice('Uploaded image preview. The image contents have not been AI-inspected.')
  }

  async function generateVideoPrompts(useLocalTemplate = false) {
    if (!approved || !imagePrompt) return
    setBusy('video')
    setError('')
    const seconds = Number.parseInt(settings.duration, 10)
    try {
      if (!useLocalTemplate) {
        const result = await requestAI('ugc-video-prompts', {
          brief,
          settings,
          approvedImagePrompt: imagePrompt,
          changeRequest,
          referenceImages: {
            character: Boolean(uploads.character),
            outfit: Boolean(uploads.outfit),
            product: Boolean(uploads.product),
          },
        })
        if (typeof result.prompt !== 'string' || !result.prompt.trim()) {
          throw new Error('AI video-prompt response did not contain a complete "prompt" string.')
        }
        setClips([{ title: 'Complete Google Flow video prompt', duration: seconds, prompt: result.prompt }])
        setNotice('Complete Google Flow prompt generated by gpt-5-mini. Uploaded references were not analyzed by AI.')
      } else {
        const referenceLocks = [
          uploads.character && '@image1 is the exact character identity reference; preserve face and distinctive features.',
          uploads.outfit && '@image2 is the exact outfit reference; preserve garment design, colors, and styling.',
          uploads.product && '@image3 is the exact product reference; preserve packaging, labels, shape, proportions, and colors exactly.',
        ].filter(Boolean).join(' ')
        const dialogue = settings.dialogue === 'None'
          ? 'No dialogue or voiceover; let the visuals and natural ambience carry the scene.'
          : settings.dialogue === 'Manual on-camera dialogue'
            ? `On-camera dialogue, verbatim: “${settings.manualDialogue || 'Use the supplied manual dialogue.'}”`
            : settings.dialogue === 'ElevenLabs voiceover'
              ? 'Optional natural Filipino Taglish voiceover; no visible lip-sync requirement.'
              : 'Natural Filipino Taglish dialogue only if it suits the scene; for fashion modeling, use no dialogue.'
        const location = settings.location === 'Custom' ? settings.customLocation || 'the selected custom location' : settings.location
        const action = settings.action === 'Custom' ? settings.customAction || 'the selected custom action' : settings.action
        const videoPrompt = [
          `TIMELINE: Create one complete Google Flow video lasting ${settings.duration}. Keep the full action coherent from opening to finish and pace its progression naturally across the entire duration.`,
          `VISUAL: Cinematic, natural ${settings.style} video based on the approved image prompt. Treat the approved image as the first-frame and visual source of truth; preserve the same character identity, outfit, product appearance, lighting, and composition. ${referenceLocks} Never alter the real product design or invent packaging details. No added text, subtitles, or watermark.`,
          `ACTION: Show ${action.toLowerCase()} in ${location}, for the ${settings.niche.toLowerCase()} concept “${brief.trim()}”. Keep movements believable, tactile product handling accurate, and character, outfit, location, and story continuity exact. ${settings.notes ? `Direction: ${settings.notes}.` : ''}`,
          `CAMERA: ${settings.cameraAngles.join(', ') || 'eye-level'} framing with ${settings.cameraMovement.toLowerCase()} movement. Use ${settings.shotPlan === 'Auto' ? 'purposeful, motivated shot changes suited to the action' : settings.shotPlan.toLowerCase()} while maintaining smooth, cinematic continuity.`,
          `DIALOGUE / VOICEOVER: ${dialogue}`,
          'AUDIO: Natural location ambience and authentic action sounds; no music unless specifically requested.',
        ].join('\n\n')
        setClips([{ title: 'Complete Google Flow video prompt', duration: seconds, prompt: videoPrompt }])
        setNotice('Local template prompt — not AI-generated. Uploaded references were not analyzed.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate video prompts.')
    } finally {
      setBusy('')
    }
  }

  async function copyText(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      setError('Could not copy to clipboard. Check browser clipboard permissions.')
    }
  }

  const uploadCards: { slot: UploadSlot; title: string; label: string; icon: string }[] = [
    { slot: 'character', title: 'Character', label: '@image1 · identity lock', icon: '✳' },
    { slot: 'outfit', title: 'Outfit', label: '@image2 · wardrobe lock', icon: '✿' },
    { slot: 'product', title: 'Product', label: '@image3 · packaging lock', icon: '◈' },
  ]

  const optionSelect = (label: string, value: string, options: string[], onChange: (value: string) => void) => (
    <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>
  )

  return (
    <section className="ugc-workspace">
      <div className="ugc-intro">
        <div className="ugc-intro-copy">
          <div className="ugc-kicker"><span /> THE CREATOR EDITION · V3</div>
          <h1>Your next great<br /><em>story starts here.</em></h1>
          <p>Build your Filipino UGC brief, approve the image, then direct every video clip.</p>
          <div className="ugc-intro-note"><span aria-hidden="true">✦</span> IMAGE FIRST. YOUR APPROVAL. THEN MOTION.</div>
        </div>
        <div className="ugc-hero-art" aria-hidden="true">
          <div className="ugc-art-orbit orbit-one" /><div className="ugc-art-orbit orbit-two" />
          <span className="ugc-art-spark spark-one">✦</span><span className="ugc-art-spark spark-two">✳</span>
          <div className="ugc-art-card"><span>YOUR SCENE, YOUR STORY</span><strong>Made to<br />feel real.</strong><i>✷</i></div>
          <div className="ugc-art-caption">01 — CREATOR STUDIO</div>
        </div>
      </div>

      <div className="ugc-section-title">
        <div><span className="ugc-step-label">01 / SETUP</span><h2>Set your scene</h2></div>
        <span className="ugc-optional">Settings stay with you through every stage</span>
      </div>
      <div className="ugc-upload-grid">
        {uploadCards.map(({ slot, title, label, icon }) => (
          <div className={`ugc-upload-card ${uploads[slot] ? 'has-upload' : ''}`} key={slot}>
            <label className="ugc-reference-pick">
              <input type="file" accept="image/*" onChange={(event) => handleReferenceUpload(slot, event)} aria-label={`Upload ${title.toLowerCase()} reference`} />
              <span className="ugc-upload-visual">{uploads[slot] ? <img src={uploads[slot]?.preview} alt={`${title} reference preview`} /> : <span className={`ugc-upload-icon icon-${slot}`}>{icon}</span>}</span>
              <span className="ugc-upload-text"><strong>{title}</strong><span>{label}</span><small>{uploads[slot] ? uploads[slot]?.file.name : 'UPLOAD IMAGE · PNG, JPG'}</small></span>
            </label>
            {uploads[slot] && <button className="ugc-remove-reference" onClick={() => removeReference(slot)} aria-label={`Remove ${title.toLowerCase()} reference`}>×</button>}
          </div>
        ))}
      </div>

      <div className="ugc-main-grid">
        <div className="ugc-left-column">
          <section className="ugc-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">01 / VIDEO SETUP</span><h2>Production settings</h2></div><span className="ugc-heading-flower">✿</span></div>
            <div className="ugc-settings-grid ugc-v3-settings">
              {optionSelect('DURATION', settings.duration, ['10 seconds', '15 seconds', '20 seconds', '30 seconds'], (value) => updateSetting('duration', value))}
              {optionSelect('CHARACTER GENDER', settings.gender, ['Auto', 'Female', 'Male'], (value) => updateSetting('gender', value))}
              {optionSelect('CHARACTER AGE', settings.ageMode, ['Auto', 'Manual age'], (value) => updateSetting('ageMode', value))}
              {settings.ageMode === 'Manual age' && <label>AGE<input type="number" min="18" max="100" value={settings.age} onChange={(event) => updateSetting('age', event.target.value)} placeholder="e.g. 28" /></label>}
              {optionSelect('LOCATION', settings.location, ['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Backyard', 'Doorway', 'Home studio', 'Cafe', 'Outdoor street', 'Reference location', 'Custom'], (value) => updateSetting('location', value))}
              {settings.location === 'Custom' && <label className="ugc-setting-wide">CUSTOM LOCATION<input value={settings.customLocation} onChange={(event) => updateSetting('customLocation', event.target.value)} placeholder="Describe the location..." /></label>}
              {optionSelect('PRODUCT NICHE', settings.niche, ['Auto', 'Fashion', 'Beauty/skincare', 'Footwear', 'Bags/accessories', 'Tech', 'Home/kitchen', 'Fitness', 'Food/drinks', 'Other'], (value) => updateSetting('niche', value))}
              {optionSelect('CHARACTER ACTION', settings.action, ['Review', 'Unboxing', 'Demonstration', 'Try-on', 'Reveal', 'Product details', 'Lifestyle', 'Before/after', 'Amazed reaction', 'Custom'], (value) => updateSetting('action', value))}
              {settings.action === 'Custom' && <label className="ugc-setting-wide">CUSTOM ACTION<input value={settings.customAction} onChange={(event) => updateSetting('customAction', event.target.value)} placeholder="Describe what the creator does..." /></label>}
              {optionSelect('UGC STYLE', settings.style, ['Natural Filipino UGC', 'Influencer', 'TikTok vlog', 'Aesthetic lifestyle', 'Playful', 'Honest review', 'Affiliate budol', 'Cinematic realistic'], (value) => updateSetting('style', value))}
              {optionSelect('SHOT PLANNING', settings.shotPlan, ['Auto', '4 shots', '5 shots'], (value) => updateSetting('shotPlan', value))}
              {optionSelect('DIALOGUE', settings.dialogue, ['None', 'AI-generated Taglish', 'Manual on-camera dialogue', 'ElevenLabs voiceover'], (value) => updateSetting('dialogue', value))}
              {optionSelect('CAMERA MOVEMENT', settings.cameraMovement, ['Static', 'Handheld', 'Dolly', 'Pan', 'Tilt', 'Orbit', 'Auto-natural'], (value) => updateSetting('cameraMovement', value))}
              <fieldset className="ugc-angle-field"><legend>CAMERA ANGLES · SELECT UP TO 3</legend><div>{['Eye-level', 'Close-up', 'Medium shot', 'Wide shot', 'Over-the-shoulder', 'POV', 'Low angle', 'Top-down'].map((angle) => <label key={angle}><input type="checkbox" disabled={!settings.cameraAngles.includes(angle) && settings.cameraAngles.length >= 3} checked={settings.cameraAngles.includes(angle)} onChange={(event) => {
                if (event.target.checked && settings.cameraAngles.length >= 3) return
                updateSetting('cameraAngles', event.target.checked ? [...settings.cameraAngles, angle] : settings.cameraAngles.filter((item) => item !== angle))
              }} />{angle}</label>)}</div></fieldset>
              {settings.dialogue === 'Manual on-camera dialogue' && <label className="ugc-setting-wide">MANUAL DIALOGUE<textarea value={settings.manualDialogue} onChange={(event) => updateSetting('manualDialogue', event.target.value)} rows={3} placeholder="Write the exact lines the creator should say..." /></label>}
              <label className="ugc-setting-wide">ADDITIONAL NOTES · VIBE, LIGHTING, BRAND TONE, ACTIONS, RESTRICTIONS<textarea value={settings.notes} onChange={(event) => updateSetting('notes', event.target.value)} rows={3} placeholder="Soft morning window light; warm, honest brand tone; avoid medical claims..." /></label>
            </div>
          </section>

        </div>

        <div className="ugc-right-column">
          <section className="ugc-panel ugc-brief-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">02 / CREATIVE DIRECTION</span><h2>What are we making?</h2></div></div>
            <label className="ugc-field-label" htmlFor="ugc-brief">PRODUCT, STORY, AUDIENCE, OR YOUR OWN CREATIVE DIRECTION</label>
            <textarea id="ugc-brief" value={brief} onChange={(event) => { setBrief(event.target.value); clearLaterStages() }} placeholder="A creator shares how this skincare product fits into her morning routine before a busy day..." rows={4} />
            <button className="ugc-action-button" onClick={() => void generateImagePrompt()} disabled={!brief.trim() || !!busy}>{busy === 'image-prompt' ? 'GENERATING…' : 'GENERATE COMPLETE IMAGE PROMPT'} <b>↗</b></button>
            <button className="ugc-copy-button" onClick={() => void generateImagePrompt(true)} disabled={!brief.trim() || !!busy}>BUILD LOCAL PROMPT · NOT AI</button>
            <p className="ugc-ai-status">AI prompts use gpt-5-mini. The local prompt template remains available if AI is unavailable; uploaded reference images are not analyzed.</p>
          </section>

          <section className="ugc-panel ugc-flow-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">03 / IMAGE FIRST</span><h2>Approve the look before motion</h2></div></div>
            <div className="ugc-flow-steps">
              <div className={`ugc-flow-step ${imagePrompt ? 'complete' : 'current'}`}><span className="ugc-flow-number">{imagePrompt ? '✓' : '01'}</span><span><strong>Prompt</strong><small>Shape the image</small></span></div><span className="ugc-flow-connector" />
              <div className={`ugc-flow-step ${approved ? 'complete' : imagePrompt ? 'current' : ''}`}><span className="ugc-flow-number">{approved ? '✓' : '02'}</span><span><strong>Image review</strong><small>Approve image</small></span></div><span className="ugc-flow-connector" />
              <div className={`ugc-flow-step ${clips.length ? 'complete' : approved ? 'current' : ''}`}><span className="ugc-flow-number">{clips.length ? '✓' : '03'}</span><span><strong>Video prompt</strong><small>Direct the motion</small></span></div>
            </div>
            {imagePrompt && <div className="ugc-prompt-card">
              <div className="ugc-prompt-card-top"><span>VERTICAL 9:16 IMAGE PROMPT</span><span>✦ READY TO EXPORT</span></div>
              <p>{imagePrompt}</p>
              <div className="ugc-prompt-actions">
                <button className="ugc-copy-button" onClick={() => copyText(imagePrompt, 'image-prompt')}>{copied === 'image-prompt' ? 'COPIED ✓' : 'COPY PROMPT ↗'}</button>
                {ugcImageEndpoint && <button className="ugc-approve-button" onClick={createImage} disabled={!!busy}>{busy === 'image' ? 'CREATING IMAGE…' : 'CREATE IMAGE ↗'}</button>}
              </div>
              {notice && <p className="ugc-ai-status">{notice}</p>}
              {!ugcImageEndpoint && <div className="ugc-external-image"><span>IMAGE GENERATION NOT CONNECTED</span><p>Copy the prompt, create the image with your preferred service, then upload it here for approval.</p><div className="ugc-image-actions"><button className="ugc-approve-button" disabled>CREATE IMAGE · NOT CONNECTED</button><button className="ugc-copy-button" onClick={() => imageInputRef.current?.click()}>UPLOAD EXTERNALLY GENERATED IMAGE</button></div></div>}
            </div>}
            <input ref={imageInputRef} className="ugc-hidden-input" type="file" accept="image/*" onChange={handleGeneratedImageUpload} aria-label="Upload externally generated image" />
            {(generatedImage || generatedImageUrl) && <div className="ugc-image-review">
              <img src={generatedImage?.preview || generatedImageUrl} alt="Image for UGC video review" />
              <div className="ugc-image-actions"><button className={`ugc-approve-button ${approved ? 'is-approved' : ''}`} onClick={() => { setApproved(true); setRequestingChanges(false); setClips([]) }} disabled={approved}>✓ {approved ? 'IMAGE APPROVED' : 'APPROVE IMAGE'}</button><button className="ugc-copy-button" onClick={() => { setApproved(false); setClips([]); setRequestingChanges(true) }}>REQUEST CHANGES</button></div>
              {requestingChanges && <div className="ugc-change-request"><label>WHAT SHOULD CHANGE?<textarea value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} rows={2} placeholder="Adjust the lighting, expression, framing, or another image detail..." /></label>
                <button className="ugc-copy-button" onClick={() => copyText(`${imagePrompt}\nRequested changes: ${changeRequest}`, 'revision-prompt')} disabled={!changeRequest.trim()}>{copied === 'revision-prompt' ? 'COPIED ✓' : 'COPY REVISION PROMPT'}</button>
                <div className="ugc-image-actions">{ugcImageEndpoint && <button className="ugc-approve-button" onClick={createImage} disabled={!!busy || !changeRequest.trim()}>{busy === 'image' ? 'REGENERATING…' : 'REGENERATE IMAGE'}</button>}<button className="ugc-copy-button" onClick={() => imageInputRef.current?.click()}>UPLOAD REVISED IMAGE</button></div>
              </div>}
              {approved && <p className="ugc-ai-status">Image approved. You can now generate the video prompts.</p>}
            </div>}
            <div className={`ugc-video-gate ${approved ? 'unlocked' : ''}`}>
              <div className="ugc-video-gate-copy"><span className="ugc-video-symbol">{approved ? '✦' : '♡'}</span><span><strong>{approved ? 'Image approved' : 'Video prompt locked'}</strong><small>{approved ? 'Generate one complete Google Flow prompt.' : 'Upload or generate and approve an image first.'}</small></span></div>
              <button className="ugc-video-button" onClick={() => void generateVideoPrompts()} disabled={!approved || !!busy}>{busy === 'video' ? 'GENERATING…' : 'GENERATE GOOGLE FLOW VIDEO PROMPT'} <span>↗</span></button>
              <button className="ugc-copy-button" onClick={() => void generateVideoPrompts(true)} disabled={!approved || !!busy}>USE LOCAL VIDEO TEMPLATE · NOT AI</button>
            </div>
            {clips.map((clip, index) => <div className="ugc-prompt-card ugc-video-result" key={`${clip.title}-${index}`}>
              <div className="ugc-prompt-card-top"><span>{clip.title.toUpperCase()}</span><span>GOOGLE FLOW · {clip.duration}s</span></div>
              <p className="ugc-clip-prompt">{clip.prompt}</p>
              <button className="ugc-copy-button" onClick={() => copyText(clip.prompt, `clip-${index}`)}>{copied === `clip-${index}` ? 'COPIED ✓' : 'COPY VIDEO PROMPT ↗'}</button>
            </div>)}
            {error && <p className="ugc-error" role="alert">{error}</p>}
          </section>
          <section className="ugc-panel ugc-duration-note"><strong>ONE COMPLETE VIDEO PROMPT</strong><span>The selected duration is carried through to one continuous Google Flow prompt.</span><small>Review and approve the image before video prompt generation.</small></section>
        </div>
      </div>
      <footer className="ugc-footer"><span>UNIVERSAL / CREATOR STUDIO</span><span>MADE WITH A LITTLE MORE HEART <i>♡</i></span></footer>
    </section>
  )
}

type FacelessReference = { file: File; preview: string }
type FacelessReferenceSlot = 'product' | 'background'
type FacelessHand = 'FEMALE HAND' | 'MALE HAND' | 'NO HAND'
type FacelessShot =
  | 'HERO SHOT'
  | 'ON TABLE SHOT'
  | 'HAND-HELD SHOT'
  | 'WIDE SHOT'
  | 'CLOSE-UP DETAIL SHOT'
  | 'PICK-UP SHOT'
  | 'OPENING / INTERACTION SHOT'
  | 'TOP VIEW / FLAT LAY'
  | '45° / THREE-QUARTER SHOT'
  | 'UGC LIFESTYLE SHOT'
type FacelessBackground = 'BACKGROUND IMAGE 2' | 'AI CHOOSE'

const facelessImageEndpoint = import.meta.env.VITE_UGC_IMAGE_ENDPOINT
const facelessAIBaseUrl = import.meta.env.VITE_UGC_AI_API_URL?.replace(/\/$/, '')
const facelessShotOptions: FacelessShot[] = [
  'HERO SHOT',
  'ON TABLE SHOT',
  'HAND-HELD SHOT',
  'WIDE SHOT',
  'CLOSE-UP DETAIL SHOT',
  'PICK-UP SHOT',
  'OPENING / INTERACTION SHOT',
  'TOP VIEW / FLAT LAY',
  '45° / THREE-QUARTER SHOT',
  'UGC LIFESTYLE SHOT',
]

function FacelessProductGenerator({ onBack }: { onBack: () => void }) {
  const [references, setReferences] = useState<Partial<Record<FacelessReferenceSlot, FacelessReference>>>({})
  const [hand, setHand] = useState<FacelessHand | ''>('')
  const [shot, setShot] = useState<FacelessShot | ''>('')
  const [background, setBackground] = useState<FacelessBackground | ''>('')
  const [generatedImage, setGeneratedImage] = useState('')
  const [productPrompt, setProductPrompt] = useState('')
  const [promptNotice, setPromptNotice] = useState('')
  const [promptBusy, setPromptBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previewUrls = useRef<string[]>([])
  const hasCompleteSettings = Boolean(references.product && hand && shot && background &&
    (background !== 'BACKGROUND IMAGE 2' || references.background))
  const imageEndpoint = facelessImageEndpoint || (facelessAIBaseUrl ? `${facelessAIBaseUrl}/images` : '')

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function updateReference(slot: FacelessReferenceSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose a valid image file.')
      return
    }
    const preview = URL.createObjectURL(file)
    previewUrls.current.push(preview)
    if (references[slot]) URL.revokeObjectURL(references[slot].preview)
    setReferences((current) => ({ ...current, [slot]: { file, preview } }))
    setGeneratedImage('')
    setProductPrompt('')
    setError('')
  }

  function removeReference(slot: FacelessReferenceSlot) {
    const existingUrl = references[slot]?.preview
    if (existingUrl) URL.revokeObjectURL(existingUrl)
    setReferences((current) => {
      const next = { ...current }
      delete next[slot]
      return next
    })
    setGeneratedImage('')
    setProductPrompt('')
    setError('')
  }

  function buildPrompt() {
    const handDirection = hand === 'FEMALE HAND'
      ? 'If a hand is shown, use a natural anatomically correct feminine hand with tasteful nail art.'
      : hand === 'MALE HAND'
        ? 'If a hand is shown, use a natural anatomically correct masculine hand with clean natural nails.'
        : 'Show no hands.'
    const backgroundDirection = background === 'BACKGROUND IMAGE 2'
      ? 'Use the provided background image 2 as the scene background.'
      : 'Choose a suitable premium commercial background for this product.'
    const shotDirection = shot === 'CLOSE-UP DETAIL SHOT'
      ? 'Use a close-up detail composition while keeping the entire product, every edge, handle, strap, and important feature fully inside the frame.'
      : `Photograph the product as a ${shot?.toLowerCase()}.`
    return [
      'Create exactly one photorealistic premium product photograph in vertical 9:16 format.',
      'PRODUCT IMAGE 1 is the authoritative product reference. Preserve its exact design, original colors, materials, logos, labels, packaging, physical proportions, and every visible product detail. Do not redesign, alter, obscure, or invent product features.',
      shotDirection,
      backgroundDirection,
      handDirection,
      'Keep the entire product completely visible and uncropped, including all edges, handles, straps, branding, and key features. Use realistic product materials, natural lighting, believable shadows, and a clean commercial composition.',
      'Faceless photography only: no visible faces, heads, or full bodies. Show only hands, wrists, and limited forearms when needed. Use no more than one main accessory. Ensure natural hand anatomy and a realistic grip.',
      'No watermark and no unnecessary added text.',
    ].join(' ')
  }

  async function generateProductPrompt(useLocalTemplate = false) {
    if (!hasCompleteSettings || !references.product) return
    setPromptBusy(true)
    setError('')
    try {
      if (useLocalTemplate) {
        setProductPrompt(buildPrompt())
        setPromptNotice('Local prompt template — not AI-generated. Uploaded reference images were not analyzed.')
      } else {
        const result = await requestAI('faceless-image-prompt', {
          prompt: buildPrompt(),
          settings: { hand, shot, background, aspectRatio: '9:16' },
          referenceNames: Object.fromEntries(Object.entries(references).map(([slot, reference]) => [slot, reference.file.name])),
        })
        if (typeof result.prompt !== 'string' || !result.prompt.trim()) throw new Error('AI prompt response did not contain a "prompt" string.')
        setProductPrompt(result.prompt)
        setPromptNotice('Prompt generated by gpt-5-mini. Uploaded reference images were not analyzed.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate the Faceless product prompt.')
    } finally {
      setPromptBusy(false)
    }
  }

  async function generateImage() {
    if (!hasCompleteSettings || !references.product) return
    if (!imageEndpoint) {
      setError('Image generation is not configured. Add VITE_UGC_IMAGE_ENDPOINT or VITE_UGC_AI_API_URL for a secure image-generation backend that accepts product reference images.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.set('prompt', productPrompt || buildPrompt())
      body.set('aspectRatio', '9:16')
      body.set('settings', JSON.stringify({
        generator: 'faceless-product-image',
        handType: hand,
        photographyShot: shot,
        background,
        aspectRatio: '9:16',
      }))
      body.set('product', references.product.file)
      if (background === 'BACKGROUND IMAGE 2' && references.background) {
        body.set('background', references.background.file)
      }
      const response = await fetch(imageEndpoint, { method: 'POST', body })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Image service returned ${response.status}.`)
      }
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object') throw new Error('The image service returned an unexpected response.')
      const imageResult = result as { imageUrl?: unknown; imageBase64?: unknown; mimeType?: unknown }
      const image = typeof imageResult.imageUrl === 'string' && imageResult.imageUrl.trim()
        ? imageResult.imageUrl
        : typeof imageResult.imageBase64 === 'string' && imageResult.imageBase64.trim()
          ? `data:${typeof imageResult.mimeType === 'string' ? imageResult.mimeType : 'image/png'};base64,${imageResult.imageBase64}`
          : ''
      if (!image) throw new Error('The image service response must include imageUrl or imageBase64. Confirm the backend supports product and background reference inputs.')
      setGeneratedImage(image)
    } catch (caught) {
      setGeneratedImage('')
      setError(caught instanceof Error ? caught.message : 'Image generation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadGeneratedImage() {
    if (!generatedImage) return
    try {
      const response = await fetch(generatedImage)
      if (!response.ok) throw new Error(`Image download returned ${response.status}.`)
      const downloadUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = 'faceless-product-image.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    } catch (caught) {
      setError(caught instanceof Error ? `Could not download the image: ${caught.message}` : 'Could not download the image.')
    }
  }

  const uploadCard = (slot: FacelessReferenceSlot, title: string, required: boolean) => {
    const reference = references[slot]
    return (
      <div className="faceless-upload-card" key={slot}>
        <input
          id={`faceless-${slot}-upload`}
          className="faceless-file-input"
          type="file"
          accept="image/*"
          onChange={(event) => updateReference(slot, event)}
          aria-label={`Upload ${title}`}
        />
        <div className="faceless-upload-preview">
          {reference ? <img src={reference.preview} alt={`${title} preview`} /> : <span aria-hidden="true">＋</span>}
        </div>
        <div className="faceless-upload-info">
          <strong>{title}</strong>
          <small>{required ? 'REQUIRED' : 'OPTIONAL'}</small>
          <div className="faceless-upload-actions">
            <label htmlFor={`faceless-${slot}-upload`}>{reference ? 'REPLACE' : 'UPLOAD'}</label>
            {reference && <button type="button" onClick={() => removeReference(slot)}>REMOVE</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="workspace faceless-workspace">
      <button className="back-link" onClick={onBack}><span aria-hidden="true">←</span> ALL GENERATORS</button>
      <div className="workspace-heading faceless-heading">
        <div className="workspace-heading-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> 02 / FACELESS PRODUCT IMAGE</div>
          <h1>FACELESS GENERATOR</h1>
          <p>Upload a product and configure your premium product photograph.</p>
        </div>
      </div>
      <div className="faceless-panel">
        <section className="faceless-section">
          <div className="faceless-section-title"><span>01 / REFERENCES</span><strong>Upload images</strong></div>
          <div className="faceless-upload-grid">
            {uploadCard('product', 'PRODUCT IMAGE 1', true)}
            {uploadCard('background', 'BACKGROUND IMAGE 2', false)}
          </div>
        </section>

        <div className="faceless-questionnaire">
          <section className="faceless-section">
            <div className="faceless-section-title"><span>02 / HAND TYPE</span><strong>Select hand type</strong></div>
            <div className="faceless-option-grid">
              {(['FEMALE HAND', 'MALE HAND', 'NO HAND'] as const).map((option) => (
                <button className={`faceless-option ${hand === option ? 'is-selected' : ''}`} key={option} onClick={() => { setHand(option); setGeneratedImage(''); setProductPrompt(''); setPromptNotice(''); setError('') }} aria-pressed={hand === option}>{option}</button>
              ))}
            </div>
          </section>
          <section className="faceless-section">
            <div className="faceless-section-title"><span>03 / PHOTOGRAPHY SHOT</span><strong>Select a shot</strong></div>
            <div className="faceless-option-grid">
              {facelessShotOptions.map((option) => (
                <button className={`faceless-option ${shot === option ? 'is-selected' : ''}`} key={option} onClick={() => { setShot(option); setGeneratedImage(''); setProductPrompt(''); setPromptNotice(''); setError('') }} aria-pressed={shot === option}>{option}</button>
              ))}
            </div>
          </section>
          <section className="faceless-section">
            <div className="faceless-section-title"><span>04 / BACKGROUND</span><strong>Select background</strong></div>
            <div className="faceless-option-grid">
              {(['BACKGROUND IMAGE 2', 'AI CHOOSE'] as const).map((option) => (
                <button className={`faceless-option ${background === option ? 'is-selected' : ''}`} key={option} onClick={() => { setBackground(option); setGeneratedImage(''); setProductPrompt(''); setPromptNotice(''); setError('') }} aria-pressed={background === option}>{option}</button>
              ))}
            </div>
            {background === 'BACKGROUND IMAGE 2' && !references.background && <p className="faceless-validation">Upload BACKGROUND IMAGE 2 to use this background option.</p>}
            {background === 'BACKGROUND IMAGE 2' && <p className="faceless-validation">The configured image service must accept a multipart “background” reference field for this option.</p>}
          </section>
        </div>

        {hasCompleteSettings && (
          <section className="faceless-confirmation">
            <div className="faceless-section-title"><span>05 / CONFIRMATION</span><strong>YOUR CONFIRMED SETTINGS</strong></div>
            <dl>
              <div><dt>Product</dt><dd>{references.product?.file.name}</dd></div>
              <div><dt>Hand Type</dt><dd>{hand}</dd></div>
              <div><dt>Photography Shot</dt><dd>{shot}</dd></div>
              <div><dt>Background</dt><dd>{background}</dd></div>
              <div><dt>Aspect Ratio</dt><dd>9:16</dd></div>
            </dl>
            <div className="faceless-prompt-actions">
              <button className="faceless-generate-button" type="button" onClick={() => void generateProductPrompt()} disabled={promptBusy || busy}>
                {promptBusy ? 'GENERATING AI PROMPT…' : 'GENERATE AI PRODUCT PROMPT'}
              </button>
              <button className="faceless-generate-button" type="button" onClick={() => void generateProductPrompt(true)} disabled={promptBusy || busy}>
                USE LOCAL PROMPT · NOT AI
              </button>
            </div>
            {productPrompt && <div className="faceless-product-prompt">
              <label htmlFor="faceless-product-prompt">PRODUCT IMAGE PROMPT</label>
              <textarea id="faceless-product-prompt" value={productPrompt} readOnly rows={7} />
              <p>{promptNotice}</p>
            </div>}
            <button className="faceless-generate-button" onClick={() => void generateImage()} disabled={busy}>
              {busy ? 'GENERATING IMAGE…' : 'CONFIRM & GENERATE IMAGE'} <span aria-hidden="true">↗</span>
            </button>
          </section>
        )}

        {!imageEndpoint && <p className="faceless-service-note">Image generation unavailable: configure a secure image backend with product-reference support. gpt-5-mini creates text prompts only; uploaded images are not analyzed by AI.</p>}
        {error && <p className="faceless-error" role="alert">{error}</p>}

        {generatedImage && (
          <section className="faceless-result">
            <div className="faceless-section-title"><span>06 / RESULT</span><strong>Your generated image</strong></div>
            <img className="faceless-result-image" src={generatedImage} alt="Generated faceless product image" />
            <div className="faceless-result-actions">
              <a href={generatedImage} target="_blank" rel="noreferrer">VIEW IMAGE</a>
              <button type="button" onClick={() => void downloadGeneratedImage()}>DOWNLOAD IMAGE</button>
              <button type="button" onClick={() => void generateImage()} disabled={busy}>{busy ? 'GENERATING…' : 'REGENERATE IMAGE'}</button>
            </div>
          </section>
        )}
      </div>
    </section>
  )
}

function App() {
  const isAdminBootstrapPage = isAdminBootstrapLocation(window.location.pathname, window.location.search)
  const [activeGenerator, setActiveGenerator] = useState<Generator | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [authView, setAuthView] = useState<(AuthView | 'admin') | null>(null)
  const [pendingGenerator, setPendingGenerator] = useState<Generator | null>(null)
  const [authError, setAuthError] = useState('')
  const [credits, setCredits] = useState<Credits | null>(null)
  const [resetToken, setResetToken] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [brief, setBrief] = useState('')
  const [tone, setTone] = useState('Warm & honest')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [pandaVideoPlaying, setPandaVideoPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    let current = true
    async function checkSession() {
      if (isAdminBootstrapPage) {
        setSessionReady(true)
        return
      }
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
        if (response.status === 401) return
        const payload = await readJsonResponse(response, 'Authentication API')
        if (!response.ok) {
          const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Could not verify your session. Please log in again.'
          throw new Error(message)
        }
        const sessionUser = typeof payload === 'object' && payload !== null && 'user' in payload ? payload.user : undefined
        if (!isAuthUser(sessionUser)) throw new Error('The authentication service returned an invalid session.')
        if (current) setUser(sessionUser)
      } catch (error) {
        if (current) setAuthError(error instanceof Error ? error.message : 'Could not verify your session. Please log in again.')
      } finally {
        if (current) setSessionReady(true)
      }
    }
    void checkSession()
    return () => { current = false }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reset = params.get('reset')
    const verification = params.get('verify')
    if (!reset && !verification) return
    setResetToken(reset ?? '')
    setAuthView(reset ? 'reset' : 'login')
    if (verification) setAuthError('Email verification links are no longer supported. Contact an administrator.')
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function loadCredits() {
    if (!user) {
      setCredits(null)
      return
    }
    try {
      const response = await fetch('/api/auth/usage', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`Usage endpoint returned ${response.status}.`)
      const payload = await readJsonResponse(response, 'Usage API')
      if (
        typeof payload !== 'object' || payload === null ||
        !('date' in payload) || typeof payload.date !== 'string' ||
        !('limit' in payload) || typeof payload.limit !== 'number' ||
        !('used' in payload) || typeof payload.used !== 'number' ||
        !('remaining' in payload) || typeof payload.remaining !== 'number'
      ) throw new Error('Usage endpoint returned invalid data.')
      setCredits({ date: payload.date, limit: payload.limit, used: payload.used, remaining: payload.remaining })
    } catch {
      setCredits(null)
    }
  }

  useEffect(() => { void loadCredits() }, [user?.id])

  useEffect(() => {
    const refresh = () => { void loadCredits() }
    window.addEventListener('auth:usage-updated', refresh)
    return () => window.removeEventListener('auth:usage-updated', refresh)
  }, [user?.id])

  useEffect(() => {
    if (!sessionReady || !user || !pendingGenerator) return
    setActiveGenerator(pendingGenerator)
    setPendingGenerator(null)
    setAuthView(null)
    setAuthError('')
  }, [pendingGenerator, sessionReady, user])

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches)
    motionPreference.addEventListener('change', updateMotionPreference)
    return () => motionPreference.removeEventListener('change', updateMotionPreference)
  }, [])

  async function openGenerator(generator: Generator) {
    if (!user) {
      setPendingGenerator(generator)
      setAuthView('login')
      return
    }
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' })
      if (response.status === 401) {
        setUser(null)
        setPendingGenerator(generator)
        setAuthView('login')
        return
      }
      const payload = await readJsonResponse(response, 'Authentication API')
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Your account could not be verified.'
        throw new Error(message)
      }
      const sessionUser = typeof payload === 'object' && payload !== null && 'user' in payload ? payload.user : undefined
      if (!isAuthUser(sessionUser)) throw new Error('The authentication service returned an invalid session.')
      setUser(sessionUser)
      setActiveGenerator(generator)
      setBrief('')
      setResult('')
      setCopied(false)
      setCopyError('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not verify your account.')
    }
  }

  async function login(username: string, password: string) {
    setAuthError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      })
      const payload = await readJsonResponse(response, 'Login API')
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Login failed. Please check your details and try again.'
        throw new Error(message)
      }
      const authenticatedUser = typeof payload === 'object' && payload !== null && 'user' in payload ? payload.user : undefined
      if (!isAuthUser(authenticatedUser)) throw new Error('The authentication service returned an invalid account.')
      setUser(authenticatedUser)
      setSessionReady(true)
      if (!pendingGenerator) setAuthView(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed. Please try again.'
      setAuthError(message)
    }
  }

  async function logout() {
    setLoggingOut(true)
    setAuthError('')
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const payload = await readJsonResponse(response, 'Authentication API')
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Logout failed. Please try again.'
        throw new Error(message)
      }
      setUser(null)
      setActiveGenerator(null)
      setPendingGenerator(null)
      setAuthView(null)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Logout failed. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  if (authView === 'admin') {
    return (
      <main className="app-shell">
        <header className="topbar">
          <button className="brand" onClick={() => { setAuthView(null); setActiveGenerator(null) }} aria-label="Go to home">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>UNIVERSAL<span className="brand-light"> / STUDIO</span></span>
          </button>
          <div className="topbar-meta"><span className="status-dot" /> ADMINISTRATION</div>
          <button className="topbar-link" onClick={() => setAuthView('profile')}>PROFILE <span aria-hidden="true">↗</span></button>
        </header>
        <AdminDashboard />
      </main>
    )
  }

  if (authView === 'profile') {
    return (
      <AuthPage
        view="profile"
        error={authError}
        onLogin={login}
        onLogout={() => void logout()}
        onNavigate={(view) => setAuthView(view === 'workspace' ? null : view)}
        user={user ?? undefined}
        credits={credits}
      />
    )
  }

  if (authView) {
    return (
      <AuthPage
        view={authView}
        selectedGenerator={pendingGenerator?.name}
        error={authError}
        onLogin={login}
        onLogout={() => void logout()}
        onNavigate={(view) => { setAuthError(''); setAuthView(view === 'workspace' ? null : view) }}
        resetToken={resetToken}
      />
    )
  }

  function createPrompt() {
    if (!activeGenerator || !brief.trim()) return
    setResult(
      `${activeGenerator.promptLead} ${brief.trim()}. Keep the tone ${tone.toLowerCase()}. Open with a compelling first-second hook, build a clear emotional or practical payoff, and close with a natural call to action. Use vivid, specific details and a polished, platform-native style.`,
    )
    setCopied(false)
  }

  async function copyPrompt() {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
  }

  async function copyHyunaMasterPrompt() {
    try {
      await navigator.clipboard.writeText(hyunaStoryMasterPrompt)
      setCopied(true)
      setCopyError('')
    } catch {
      setCopied(false)
      setCopyError('Copy failed. Check browser clipboard permissions and try again.')
    }
  }

  if (isAdminBootstrapPage) return <AdminBootstrapPage />

  return (
    <main className={`app-shell ${activeGenerator?.id === 'ugc' ? 'ugc-shell' : ''} ${activeGenerator?.id === 'storyboard' ? 'storyboard-shell' : ''} ${!activeGenerator ? 'home-shell' : ''}`}>
      {!activeGenerator && (
        <div className={`home-wallpaper ${pandaVideoPlaying ? 'is-playing' : ''}`} aria-hidden="true">
          <img src="/images/file_00000000c5e08211873d150d4db39bde.png" alt="" />
          {!reducedMotion && (
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster="/images/file_00000000c5e08211873d150d4db39bde.png"
              onPlaying={() => setPandaVideoPlaying(true)}
              onError={() => setPandaVideoPlaying(false)}
            >
              <source src="/videos/hyuna-panda-background.mp4" type="video/mp4" />
            </video>
          )}
        </div>
      )}
      <header className="topbar">
        <button className="brand" onClick={() => setActiveGenerator(null)} aria-label="Go to home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>UNIVERSAL{!activeGenerator && ' AI'}<span className="brand-light"> / {activeGenerator ? 'STUDIO' : 'PROMPT STUDIO'}</span></span>
        </button>
        <div className="topbar-meta"><span className="status-dot" /> CREATIVE ENGINE <span className="meta-divider">/</span> 01.26</div>
        {user && credits && <span className="credits-display" aria-label={`${credits.remaining} AI credits remaining today`}>{credits.remaining} / {credits.limit} AI CREDITS</span>}
        <button className="topbar-link" onClick={() => setActiveGenerator(null)}>
          {activeGenerator ? 'ALL GENERATORS' : 'WORKSPACE'} <span aria-hidden="true">↗</span>
        </button>
        {user && (
          <>
            <button className="session-logout" type="button" onClick={() => setAuthView('profile')}>PROFILE</button>
            {user.role === 'admin' && <button className="session-logout" type="button" onClick={() => setAuthView('admin')}>ADMIN</button>}
          </>
        )}
        {user && activeGenerator && (
          <button className="session-logout" type="button" onClick={() => void logout()} disabled={loggingOut}>
            {loggingOut ? 'LOGGING OUT…' : 'LOG OUT'}
          </button>
        )}
      </header>
      {authError && user && <p className="session-error" role="alert">{authError}</p>}

      {activeGenerator?.id === 'ugc' ? (
        <UGCWorkspace />
      ) : activeGenerator?.id === 'storyboard' ? (
        <StoryboardGenerator onBack={() => setActiveGenerator(null)} />
      ) : activeGenerator?.id === 'faceless' ? (
        <FacelessProductGenerator onBack={() => setActiveGenerator(null)} />
      ) : activeGenerator?.id === 'drama' ? (
        <section className="workspace drama-prompt-page">
          <button className="back-link" onClick={() => setActiveGenerator(null)}><span aria-hidden="true">←</span> ALL GENERATORS</button>
          <div className="workspace-heading">
            <div className="workspace-heading-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> {activeGenerator.number} / {activeGenerator.tag}</div>
              <h1>{activeGenerator.name}</h1>
              <p>{activeGenerator.description}</p>
            </div>
          </div>
          <section className="result-panel drama-master-panel">
            <div className="panel-heading"><span>01</span><h2>HYUNA STORY — MASTER PROMPT</h2></div>
            <pre className="drama-master-prompt">{hyunaStoryMasterPrompt}</pre>
            <button className="copy-button drama-copy-button" onClick={copyHyunaMasterPrompt}>
              {copied ? 'Copied!' : 'COPY PROMPT'} <span aria-hidden="true">{copied ? '✓' : '↗'}</span>
            </button>
            {copyError && <p className="drama-copy-error" role="alert">{copyError}</p>}
          </section>
        </section>
      ) : activeGenerator ? (
        <section className="workspace">
          <button className="back-link" onClick={() => setActiveGenerator(null)}><span aria-hidden="true">←</span> ALL GENERATORS</button>
          <div className="workspace-heading">
            <div className="workspace-heading-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> {activeGenerator.number} / {activeGenerator.tag}</div>
              <h1>{activeGenerator.name}</h1>
              <p>{activeGenerator.description}</p>
            </div>
          </div>
          <div className="workspace-grid">
            <section className="editor-panel">
              <div className="panel-heading"><span>01</span><h2>Set the scene</h2></div>
              <label htmlFor="brief">YOUR CREATIVE BRIEF</label>
              <textarea
                id="brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="What are we making? Add a product, idea, audience, or moment..."
                rows={7}
              />
              <label htmlFor="tone">CREATIVE TONE</label>
              <select id="tone" value={tone} onChange={(event) => setTone(event.target.value)}>
                <option>Warm &amp; honest</option>
                <option>Bold &amp; playful</option>
                <option>Quietly cinematic</option>
                <option>Direct &amp; confident</option>
              </select>
              <button className="generate-button" onClick={createPrompt} disabled={!brief.trim()}>
                GENERATE PROMPT <span aria-hidden="true">↗</span>
              </button>
            </section>
            <section className="result-panel" aria-live="polite">
              <div className="panel-heading"><span>02</span><h2>Your direction</h2></div>
              {result ? (
                <>
                  <p className="result-copy">{result}</p>
                  <button className="copy-button" onClick={copyPrompt}>{copied ? 'COPIED' : 'COPY PROMPT'} <span aria-hidden="true">{copied ? '✓' : '↗'}</span></button>
                </>
              ) : (
                <div className="result-empty"><span className="result-spark" aria-hidden="true">✳</span><p>Your next idea starts here.</p><span>ADD A BRIEF TO GENERATE YOUR CREATIVE DIRECTION</span></div>
              )}
            </section>
          </div>
        </section>
      ) : (
        <>
          <section className="studio-hero">
            <div className="studio-hero-copy">
              <div className="home-brand-label">HYUNA PROMPT GENERATOR</div>
              <div className="studio-kicker"><span /> YOUR CREATIVE PLAYGROUND</div>
              <h1>Dream it.<br /><em>Make it magic.</em></h1>
              <p>One little idea can become something wonderful. Choose a studio and let’s make it happen.</p>
              <a className="studio-hero-link" href="#generator-library">EXPLORE THE STUDIOS <span aria-hidden="true">↓</span></a>
              <div className="studio-hero-caption"><span className="studio-live-dot" /> FOUR CREATIVE STUDIOS <i /> MADE FOR BIG IDEAS</div>
            </div>
          </section>

          <section className="studio-library" id="generator-library" aria-label="Creative generators">
            <div className="studio-library-heading"><div><span className="studio-section-kicker">A STUDIO FOR EVERY STORY</span><h2>Where will your idea go?</h2></div><span className="studio-count">04 <i /> STUDIOS</span></div>
            <div className="studio-card-grid">
              {generators.map((generator) => (
                <button className={`studio-card studio-card-${generator.id}`} key={generator.id} onClick={() => openGenerator(generator)} aria-label={`Open ${generator.name}`}>
                  <img className="studio-card-image" src={generatorPandaImages[generator.id]} alt="" loading="lazy" />
                  <span className="studio-card-wash" />
                  <span className="studio-card-top"><span>{generator.number} <i /> {generator.tag}</span><span className="studio-card-arrow" aria-hidden="true">↗</span></span>
                  <span className="studio-card-bottom"><span className="studio-card-name">{generator.name}</span><span className="studio-card-description">{generator.description}</span></span>
                  <span className="studio-card-frame" />
                </button>
              ))}
            </div>
          </section>
          <footer className="studio-footer"><span>UNIVERSAL AI PROMPT STUDIO</span><span>MAKE A LITTLE MAGIC <i>✳</i></span></footer>
        </>
      )}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)