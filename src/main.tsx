import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
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
  dialogue: 'AI-generated Taglish',
  manualDialogue: '',
  cameraAngles: ['Eye-level'],
  cameraMovement: 'Auto-natural',
  notes: '',
}

const ugcAIBaseUrl = import.meta.env.VITE_UGC_AI_API_URL?.replace(/\/$/, '')

type UGCImage = { file: File; preview: string }
type UGCClip = { title: string; duration: number; prompt: string }

function UGCWorkspace() {
  const [brief, setBrief] = useState('')
  const [idea, setIdea] = useState('')
  const [ideaResult, setIdeaResult] = useState('')
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

  async function requestBackend(path: string, init: RequestInit) {
    if (!ugcAIBaseUrl) throw new Error('No AI backend is configured. Add VITE_UGC_AI_API_URL to enable this feature.')
    const response = await fetch(`${ugcAIBaseUrl}${path}`, init)
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(detail || `AI service returned ${response.status}.`)
    }
    return response.json() as Promise<Record<string, unknown>>
  }

  async function requestIdea() {
    if (!idea.trim()) return
    setError('')
    setIdeaResult('')
    setBusy('idea')
    try {
      const result = await requestBackend('/idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIdea: idea.trim(),
          niche: settings.niche,
          action: settings.action === 'Custom' ? settings.customAction : settings.action,
          style: settings.style,
          request: 'Return creative UGC concepts, natural Filipino Taglish dialogue, and product-niche-specific creator actions.',
        }),
      })
      const content = result.content
      if (typeof content !== 'string' || !content.trim()) throw new Error('AI idea response did not contain a "content" string.')
      setIdeaResult(content)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate ideas.')
    } finally {
      setBusy('')
    }
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

  async function generateImagePrompt() {
    if (!brief.trim()) return
    setBusy('image-prompt')
    setError('')
    clearLaterStages()
    try {
      if (ugcAIBaseUrl) {
        const result = await requestBackend('/image-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brief: brief.trim(),
            settings,
            referenceNames: Object.fromEntries(Object.entries(uploads).map(([key, image]) => [key, image?.file.name])),
          }),
        })
        if (typeof result.prompt !== 'string' || !result.prompt.trim()) throw new Error('AI image-prompt response did not contain a "prompt" string.')
        setImagePrompt(result.prompt)
        setNotice('Generated by the configured AI backend.')
      } else {
        setImagePrompt(buildImagePrompt())
        setNotice('Prompt builder output — not AI-generated. Connect an AI backend to generate with AI.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate an image prompt.')
    } finally {
      setBusy('')
    }
  }

  async function createImage() {
    if (!imagePrompt || !ugcAIBaseUrl) return
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
      const result = await requestBackend('/images', { method: 'POST', body: form })
      if (typeof result.imageUrl !== 'string' || !result.imageUrl.trim()) throw new Error('Image service response did not contain an "imageUrl".')
      setGeneratedImage(null)
      setGeneratedImageUrl(result.imageUrl)
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

  async function generateVideoPrompts() {
    if (!approved || !imagePrompt) return
    setBusy('video')
    setError('')
    const seconds = Number.parseInt(settings.duration, 10)
    const clipDurations = seconds === 15 ? [10, 5] : Array.from({ length: seconds / 10 }, () => 10)
    try {
      if (ugcAIBaseUrl) {
        const result = await requestBackend('/video-prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brief, settings, approvedImagePrompt: imagePrompt, changeRequest }),
        })
        if (!Array.isArray(result.clips) || result.clips.length !== clipDurations.length || !result.clips.every((clip) => typeof clip === 'object' && clip !== null && typeof (clip as { prompt?: unknown }).prompt === 'string')) {
          throw new Error(`AI video response must contain exactly ${clipDurations.length} clips with prompt strings.`)
        }
        const sections = ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE:', 'AUDIO:']
        const validatedClips = result.clips.map((clip, index) => {
          const prompt = (clip as { prompt: string }).prompt
          if (!sections.every((section) => prompt.includes(section))) throw new Error(`AI clip ${index + 1} is missing one or more required prompt sections.`)
          return { title: `Clip ${index + 1} · ${clipDurations[index]} seconds`, duration: clipDurations[index], prompt }
        })
        setClips(validatedClips)
        setNotice('Video prompts generated by the configured AI backend.')
      } else {
        const prompts = clipDurations.map((duration, index): UGCClip => {
          const angleList = settings.cameraAngles.join(', ') || 'eye-level'
          const referenceLocks = [
            uploads.character && '@image1 is the exact character identity reference; preserve face and distinctive features.',
            uploads.outfit && '@image2 is the exact outfit reference; preserve design, colors, and styling.',
            uploads.product && '@image3 is the exact product reference; preserve packaging, shape, and colors.',
          ].filter(Boolean).join(' ')
          const dialogue = settings.dialogue === 'None'
            ? 'No spoken dialogue.'
            : settings.dialogue === 'Manual on-camera dialogue'
              ? `On-camera dialogue: “${settings.manualDialogue || 'Use the supplied manual dialogue.'}” Preserve the supplied wording.`
              : settings.dialogue === 'ElevenLabs voiceover'
                ? 'Voiceover: natural Filipino Taglish, conversational pacing, no visible lip-sync requirement.'
                : 'On-camera natural Filipino Taglish dialogue; accurately synchronize every spoken word to the character’s lips.'
          const dialogueLimit = `Keep spoken dialogue to a maximum of 20–25 words per 10 seconds${duration === 5 ? ' (about 10–12 words for this 5-second segment)' : ''}.`
          const shots = settings.shotPlan === '4 shots' ? 4 : settings.shotPlan === '5 shots' ? 5 : 4
          const shotBeats = ['establish the creator and setting', 'introduce the product with a natural hand movement', 'show a clear product interaction or detail', 'capture a believable reaction', 'finish on the product and creator together']
          const shotDirections = Array.from({ length: duration === 5 ? 2 : shots }, (_, shotIndex) =>
            `Shot ${shotIndex + 1}: ${shotBeats[shotIndex]}.`,
          ).join(' ')
          return {
            title: `Clip ${index + 1} · ${duration} seconds`,
            duration,
            prompt: [
              `VISUAL: Photorealistic vertical 9:16 UGC, ${settings.style}; continue the approved image’s character, outfit, product, lighting, and setting without changes. ${referenceLocks} No background music, subtitles, added text overlays, or watermark.`,
              `ACTION: ${settings.action === 'Custom' ? settings.customAction || 'the custom creator action' : settings.action} for ${brief.trim()}. Use natural movements, realistic product handling, coherent hands, and believable expressions; maintain continuity. ${settings.notes ? `Additional direction and restrictions: ${settings.notes}.` : ''} ${shotDirections}`,
              `CAMERA: ${angleList}; ${settings.cameraMovement.toLowerCase()} camera movement; purposeful, steady shot transitions. ${duration === 10 ? 'Plan approximately 4–5 purposeful shots when appropriate.' : ''}`,
              `DIALOGUE: ${dialogue} ${dialogueLimit}`,
              'AUDIO: Clean natural room tone and product handling sounds only; no background music.',
            ].join('\n\n'),
          }
        })
        setClips(prompts)
        setNotice('Template-generated prompts — not AI-generated. Connect an AI backend for AI-written clip directions.')
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
          <PandaArtwork variant="ugc" className="ugc-panda-illustration" />
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

          <section className="ugc-panel ugc-brief-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">02 / IDEA ASSISTANT</span><h2>Start with your product idea</h2></div><span className="ugc-heading-flower">✧</span></div>
            <label className="ugc-field-label" htmlFor="ugc-idea">PRODUCT IDEA</label>
            <textarea id="ugc-idea" value={idea} onChange={(event) => setIdea(event.target.value)} rows={2} placeholder="A gentle sunscreen for humid, sunny commutes..." />
            <button className="ugc-action-button" onClick={requestIdea} disabled={!ugcAIBaseUrl || !idea.trim() || !!busy}>{busy === 'idea' ? 'ASKING AI…' : 'GENERATE CREATIVE CONCEPTS'} <b>↗</b></button>
            <p className="ugc-ai-status">{ugcAIBaseUrl ? 'AI backend configured · idea results use the connected service.' : 'AI unavailable: configure VITE_UGC_AI_API_URL to enable real AI. No static ideas are presented as AI.'}</p>
            {ideaResult && <div className="ugc-ai-result"><strong>AI-GENERATED CONCEPTS</strong><p>{ideaResult}</p><button className="ugc-copy-button" onClick={() => copyText(ideaResult, 'idea')}>{copied === 'idea' ? 'COPIED ✓' : 'COPY IDEAS'}</button><button className="ugc-copy-button" onClick={() => { setBrief((current) => current ? `${current}\n${ideaResult}` : ideaResult); clearLaterStages() }}>USE IN CREATIVE BRIEF</button></div>}
          </section>
        </div>

        <div className="ugc-right-column">
          <section className="ugc-panel ugc-brief-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">02 / YOUR CREATIVE BRIEF</span><h2>What are we making?</h2></div></div>
            <label className="ugc-field-label" htmlFor="ugc-brief">PRODUCT, STORY, AUDIENCE, OR YOUR OWN CREATIVE DIRECTION</label>
            <textarea id="ugc-brief" value={brief} onChange={(event) => { setBrief(event.target.value); clearLaterStages() }} placeholder="A creator shares how this skincare product fits into her morning routine before a busy day..." rows={4} />
            <button className="ugc-action-button" onClick={generateImagePrompt} disabled={!brief.trim() || !!busy}>{busy === 'image-prompt' ? 'GENERATING…' : 'GENERATE IMAGE PROMPT'} <b>↗</b></button>
            <p className="ugc-ai-status">{ugcAIBaseUrl ? 'AI image prompt generation is available through your configured backend.' : 'Without a backend, this creates a clearly labeled prompt template; it does not inspect your images or use AI.'}</p>
          </section>

          <section className="ugc-panel ugc-flow-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">03 / IMAGE FIRST</span><h2>Approve the look before motion</h2></div></div>
            <div className="ugc-flow-steps">
              <div className={`ugc-flow-step ${imagePrompt ? 'complete' : 'current'}`}><span className="ugc-flow-number">{imagePrompt ? '✓' : '01'}</span><span><strong>Prompt</strong><small>Shape the image</small></span></div><span className="ugc-flow-connector" />
              <div className={`ugc-flow-step ${approved ? 'complete' : imagePrompt ? 'current' : ''}`}><span className="ugc-flow-number">{approved ? '✓' : '02'}</span><span><strong>Image review</strong><small>Approve image</small></span></div><span className="ugc-flow-connector" />
              <div className={`ugc-flow-step ${clips.length ? 'complete' : approved ? 'current' : ''}`}><span className="ugc-flow-number">{clips.length ? '✓' : '03'}</span><span><strong>Video clips</strong><small>Direct the motion</small></span></div>
            </div>
            {imagePrompt && <div className="ugc-prompt-card">
              <div className="ugc-prompt-card-top"><span>VERTICAL 9:16 IMAGE PROMPT</span><span>✦ READY TO EXPORT</span></div>
              <p>{imagePrompt}</p>
              <div className="ugc-prompt-actions">
                <button className="ugc-copy-button" onClick={() => copyText(imagePrompt, 'image-prompt')}>{copied === 'image-prompt' ? 'COPIED ✓' : 'COPY PROMPT ↗'}</button>
                {ugcAIBaseUrl && <button className="ugc-approve-button" onClick={createImage} disabled={!!busy}>{busy === 'image' ? 'CREATING IMAGE…' : 'CREATE IMAGE ↗'}</button>}
              </div>
              {notice && <p className="ugc-ai-status">{notice}</p>}
              {!ugcAIBaseUrl && <div className="ugc-external-image"><span>IMAGE GENERATION NOT CONNECTED</span><p>Copy the prompt, create the image with your preferred service, then upload it here for approval.</p><div className="ugc-image-actions"><button className="ugc-approve-button" disabled>CREATE IMAGE · NOT CONNECTED</button><button className="ugc-copy-button" onClick={() => imageInputRef.current?.click()}>UPLOAD EXTERNALLY GENERATED IMAGE</button></div></div>}
            </div>}
            <input ref={imageInputRef} className="ugc-hidden-input" type="file" accept="image/*" onChange={handleGeneratedImageUpload} aria-label="Upload externally generated image" />
            {(generatedImage || generatedImageUrl) && <div className="ugc-image-review">
              <img src={generatedImage?.preview || generatedImageUrl} alt="Image for UGC video review" />
              <div className="ugc-image-actions"><button className={`ugc-approve-button ${approved ? 'is-approved' : ''}`} onClick={() => { setApproved(true); setRequestingChanges(false); setClips([]) }} disabled={approved}>✓ {approved ? 'IMAGE APPROVED' : 'APPROVE IMAGE'}</button><button className="ugc-copy-button" onClick={() => { setApproved(false); setClips([]); setRequestingChanges(true) }}>REQUEST CHANGES</button></div>
              {requestingChanges && <div className="ugc-change-request"><label>WHAT SHOULD CHANGE?<textarea value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} rows={2} placeholder="Adjust the lighting, expression, framing, or another image detail..." /></label>
                <button className="ugc-copy-button" onClick={() => copyText(`${imagePrompt}\nRequested changes: ${changeRequest}`, 'revision-prompt')} disabled={!changeRequest.trim()}>{copied === 'revision-prompt' ? 'COPIED ✓' : 'COPY REVISION PROMPT'}</button>
                <div className="ugc-image-actions">{ugcAIBaseUrl && <button className="ugc-approve-button" onClick={createImage} disabled={!!busy || !changeRequest.trim()}>{busy === 'image' ? 'REGENERATING…' : 'REGENERATE IMAGE'}</button>}<button className="ugc-copy-button" onClick={() => imageInputRef.current?.click()}>UPLOAD REVISED IMAGE</button></div>
              </div>}
              {approved && <p className="ugc-ai-status">Image approved. You can now generate the video prompts.</p>}
            </div>}
            <div className={`ugc-video-gate ${approved ? 'unlocked' : ''}`}>
              <div className="ugc-video-gate-copy"><span className="ugc-video-symbol">{approved ? '✦' : '♡'}</span><span><strong>{approved ? 'Image approved' : 'Video prompt locked'}</strong><small>{approved ? 'Generate structured Google Flow clip prompts.' : 'Upload or generate and approve an image first.'}</small></span></div>
              <button className="ugc-video-button" onClick={generateVideoPrompts} disabled={!approved || !!busy}>{busy === 'video' ? 'GENERATING…' : 'GENERATE VIDEO PROMPTS'} <span>↗</span></button>
            </div>
            {clips.map((clip, index) => <div className="ugc-prompt-card ugc-video-result" key={`${clip.title}-${index}`}>
              <div className="ugc-prompt-card-top"><span>{clip.title.toUpperCase()}</span><span>GOOGLE FLOW · {clip.duration}s</span></div>
              <p className="ugc-clip-prompt">{clip.prompt}</p>
              <button className="ugc-copy-button" onClick={() => copyText(clip.prompt, `clip-${index}`)}>{copied === `clip-${index}` ? 'COPIED ✓' : 'COPY CLIP PROMPT ↗'}</button>
            </div>)}
            {error && <p className="ugc-error" role="alert">{error}</p>}
          </section>
          <section className="ugc-panel ugc-duration-note"><strong>DURATION PLAN</strong><span>10s: 1 clip · 15s: 10s + 5s · 20s: 2 clips · 30s: 3 clips</span><small>Some video tools may require trimming the 5-second segment.</small></section>
        </div>
      </div>
      <footer className="ugc-footer"><span>UNIVERSAL / CREATOR STUDIO</span><span>MADE WITH A LITTLE MORE HEART <i>♡</i></span></footer>
    </section>
  )
}

function PandaArtwork({ variant = 'hero', className = '', label = 'Original illustrated panda character' }: { variant?: string; className?: string; label?: string }) {
  const accent = variant === 'drama' ? '#ff4b66' : variant === 'faceless' ? '#b780ff' : variant === 'storyboard' ? '#e79cff' : '#f05baf'
  const coatId = `panda-coat-${variant}`
  const suitId = `panda-suit-${variant}`
  const glowId = `panda-glow-${variant}`
  const shadowId = `panda-shadow-${variant}`
  return (
    <svg className={className} viewBox="0 0 520 390" role="img" aria-label={label}>
      <defs>
        <radialGradient id={glowId}><stop stopColor={accent} stopOpacity=".42" /><stop offset=".58" stopColor="#8e39ba" stopOpacity=".18" /><stop offset="1" stopColor="#21102f" stopOpacity="0" /></radialGradient>
        <linearGradient id={coatId} x1="157" y1="220" x2="359" y2="365" gradientUnits="userSpaceOnUse"><stop stopColor="#393247" /><stop offset=".48" stopColor="#211d2d" /><stop offset="1" stopColor="#100e19" /></linearGradient>
        <linearGradient id={suitId} x1="188" y1="275" x2="328" y2="365" gradientUnits="userSpaceOnUse"><stop stopColor={accent} /><stop offset=".48" stopColor="#75325f" /><stop offset="1" stopColor="#282033" /></linearGradient>
        <radialGradient id={`panda-face-${variant}`} cx=".36" cy=".24" r=".82"><stop stopColor="#fff" /><stop offset=".68" stopColor="#f7f1f4" /><stop offset="1" stopColor="#d7cbd8" /></radialGradient>
        <linearGradient id={`panda-eye-${variant}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#342c3d" /><stop offset=".58" stopColor="#111019" /><stop offset="1" stopColor="#06060a" /></linearGradient>
        <filter id={shadowId} x="60" y="5" width="400" height="390" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="13" /></filter>
      </defs>
      <ellipse cx="262" cy="204" rx="205" ry="190" fill={`url(#${glowId})`} />
      <ellipse cx="259" cy="356" rx="137" ry="18" fill="#d13e9c" fillOpacity=".32" filter={`url(#${shadowId})`} />
      <path d="M143 347c0-75 43-137 117-137s117 62 117 137v16H143v-16Z" fill={`url(#${coatId})`} />
      <path d="M181 291c18-21 48-34 79-34s61 13 79 34l-15 74H196l-15-74Z" fill={`url(#${suitId})`} />
      <path d="M191 293c20 15 44 23 69 23s49-8 69-23l-8 72H199l-8-72Z" fill="#15131d" fillOpacity=".52" />
      <path d="m217 276 43 33 43-33-13-18h-60l-13 18Z" fill="#f1eaf0" />
      <path d="m260 304 18 13-18 15-18-15 18-13Z" fill={accent} />
      <path d="M164 244c-21 13-35 36-36 64-1 14 10 24 22 19l49-21-35-62ZM356 244c21 13 35 36 36 64 1 14-10 24-22 19l-49-21 35-62Z" fill={`url(#${coatId})`} />
      <path d="M184 252c10 5 18 13 23 22m129-22c-10 5-18 13-23 22" stroke="#fff" strokeOpacity=".2" strokeWidth="5" strokeLinecap="round" />
      <circle cx="185" cy="101" r="44" fill={`url(#${coatId})`} /><circle cx="337" cy="101" r="44" fill={`url(#${coatId})`} />
      <circle cx="185" cy="96" r="26" fill="#100f18" fillOpacity=".64" /><circle cx="337" cy="96" r="26" fill="#100f18" fillOpacity=".64" />
      <path d="M150 157c0-58 48-105 110-105s110 47 110 105-48 109-110 109-110-51-110-109Z" fill={`url(#panda-face-${variant})`} />
      <path d="M164 92c16-25 43-41 73-44m43 1c30 4 56 20 72 44" fill="none" stroke="#fff" strokeOpacity=".76" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="214" cy="151" rx="28" ry="37" transform="rotate(24 214 151)" fill={`url(#panda-eye-${variant})`} />
      <ellipse cx="306" cy="151" rx="28" ry="37" transform="rotate(-24 306 151)" fill={`url(#panda-eye-${variant})`} />
      <ellipse cx="219" cy="144" rx="9" ry="12" fill="#fff" /><ellipse cx="301" cy="144" rx="9" ry="12" fill="#fff" />
      <circle cx="222" cy="143" r="3.5" fill="#17131e" /><circle cx="298" cy="143" r="3.5" fill="#17131e" />
      <path d="M189 123c9-12 20-17 33-18m99 0c13 1 24 6 33 18" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="184" cy="190" rx="19" ry="10" fill={accent} fillOpacity=".25" /><ellipse cx="336" cy="190" rx="19" ry="10" fill={accent} fillOpacity=".25" />
      <path d="M251 179c0-6 5-10 11-10s11 4 11 10c0 5-7 10-11 12-4-2-11-7-11-12Z" fill="#302635" />
      <path d="M262 192c-1 12-9 16-18 14m18-14c1 12 9 16 18 14" stroke="#5b4657" strokeWidth="3" strokeLinecap="round" />
      <path d="m347 82 6-17 7 17 17 6-17 7-7 17-6-17-17-7 17-6Z" fill={accent} />
      <path d="m115 168 4-11 5 11 11 4-11 5-5 11-4-11-11-5 11-4Z" fill="#b780ff" />
      <circle cx="391" cy="205" r="4" fill={accent} /><circle cx="132" cy="246" r="5" fill="#ff5d91" />
      {variant === 'faceless' && <g fill="none" stroke={accent} strokeWidth="8"><path d="M157 146c-24-4-38 11-38 33v14c0 15 10 25 25 25h10v-42h-10" /><path d="M363 146c24-4 38 11 38 33v14c0 15-10 25-25 25h-10v-42h10" /><path d="M165 83c16-35 43-53 95-53s79 18 95 53" /></g>}
      {variant === 'drama' && <g fill={accent}><path d="m219 59 12-25 12 25 27 4-19 19 5 27-25-13-25 13 5-27-19-19Z" /><path d="m314 73 8-16 8 16 17 3-12 12 3 17-16-8-15 8 3-17-13-12Z" opacity=".75" /></g>}
      {variant === 'storyboard' && <g><path d="m169 80 16-35c25 5 39 16 46 34l-15 19-40-4Z" fill="#231c33" stroke={accent} strokeWidth="4" /><path d="m179 49 7-15 52 19-7 15Z" fill={accent} /><path d="m179 50-10-6-4 16 14-1Z" fill="#f5d9c5" /></g>}
      {variant === 'ugc' && <g fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round"><path d="M150 122c-13 5-22 15-26 28m246-28c13 5 22 15 26 28" /><path d="m122 137 8-18 8 18 18 7-18 7-8 18-8-18-18-7Z" fill={accent} stroke="none" /></g>}
      <path d="M219 334c12 7 26 11 41 11s29-4 41-11" stroke="#fff" strokeOpacity=".55" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function App() {
  const [activeGenerator, setActiveGenerator] = useState<Generator | null>(null)
  const [brief, setBrief] = useState('')
  const [tone, setTone] = useState('Warm & honest')
  const [result, setResult] = useState('')
  const [copied, setCopied] = useState(false)
  const [facelessOwnCreative, setFacelessOwnCreative] = useState(false)

  function openGenerator(generator: Generator) {
    setActiveGenerator(generator)
    setBrief('')
    setResult('')
    setCopied(false)
    setFacelessOwnCreative(false)
  }

  function createPrompt() {
    if (!activeGenerator || !brief.trim()) return
    const promptLead = activeGenerator.id === 'faceless' && facelessOwnCreative
      ? 'Build a faceless visual story from this creative direction:'
      : activeGenerator.promptLead
    setResult(
      `${promptLead} ${brief.trim()}. Keep the tone ${tone.toLowerCase()}. Open with a compelling first-second hook, build a clear emotional or practical payoff, and close with a natural call to action. Use vivid, specific details and a polished, platform-native style.`,
    )
    setCopied(false)
  }

  async function copyPrompt() {
    if (!result) return
    await navigator.clipboard.writeText(result)
    setCopied(true)
  }

  return (
    <main className={`app-shell ${activeGenerator?.id === 'ugc' ? 'ugc-shell' : ''} ${!activeGenerator ? 'home-shell' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setActiveGenerator(null)} aria-label="Go to home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>UNIVERSAL{!activeGenerator && ' AI'}<span className="brand-light"> / {activeGenerator ? 'STUDIO' : 'PROMPT STUDIO'}</span></span>
        </button>
        <div className="topbar-meta"><span className="status-dot" /> CREATIVE ENGINE <span className="meta-divider">/</span> 01.26</div>
        <button className="topbar-link" onClick={() => setActiveGenerator(null)}>
          {activeGenerator ? 'ALL GENERATORS' : 'WORKSPACE'} <span aria-hidden="true">↗</span>
        </button>
      </header>

      {activeGenerator?.id === 'ugc' ? (
        <UGCWorkspace />
      ) : activeGenerator ? (
        <section className="workspace">
          <button className="back-link" onClick={() => setActiveGenerator(null)}><span aria-hidden="true">←</span> ALL GENERATORS</button>
          <div className="workspace-heading">
            <div className="workspace-heading-copy">
              <div className="eyebrow"><span className="eyebrow-line" /> {activeGenerator.number} / {activeGenerator.tag}</div>
              <h1>{activeGenerator.name}</h1>
              <p>{activeGenerator.description}</p>
            </div>
            <div className={`workspace-panda workspace-panda-${activeGenerator.id}`} aria-hidden="true"><PandaArtwork variant={activeGenerator.id} label={`${activeGenerator.name} panda illustration`} /></div>
          </div>
          <div className="workspace-grid">
            <section className="editor-panel">
              <div className="panel-heading"><span>01</span><h2>Set the scene</h2></div>
              {activeGenerator.id === 'faceless' && (
                <label htmlFor="faceless-creative-mode">CREATIVE MODE</label>
              )}
              {activeGenerator.id === 'faceless' && (
                <select id="faceless-creative-mode" value={facelessOwnCreative ? 'own' : 'standard'} onChange={(event) => {
                  setFacelessOwnCreative(event.target.value === 'own')
                  setResult('')
                }}>
                  <option value="standard">Faceless video</option>
                  <option value="own">Own Creative direction</option>
                </select>
              )}
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
              <div className="studio-kicker"><span /> YOUR CREATIVE PLAYGROUND</div>
              <h1>Dream it.<br /><em>Make it magic.</em></h1>
              <p>One little idea can become something wonderful. Choose a studio and let’s make it happen.</p>
              <a className="studio-hero-link" href="#generator-library">EXPLORE THE STUDIOS <span aria-hidden="true">↓</span></a>
              <div className="studio-hero-caption"><span className="studio-live-dot" /> FOUR CREATIVE STUDIOS <i /> MADE FOR BIG IDEAS</div>
            </div>
            <div className="studio-panda-art"><span className="panda-art-glint glint-a">✦</span><span className="panda-art-glint glint-b">✧</span><PandaArtwork variant="hero" label="Original cinematic panda studio illustration" /><span className="panda-art-label"><i>✦</i> YOUR IDEAS HAVE A FRIEND</span></div>
          </section>

          <section className="studio-library" id="generator-library" aria-label="Creative generators">
            <div className="studio-library-heading"><div><span className="studio-section-kicker">A STUDIO FOR EVERY STORY</span><h2>Where will your idea go?</h2></div><span className="studio-count">04 <i /> STUDIOS</span></div>
            <div className="studio-card-grid">
              {generators.map((generator) => (
                <button className={`studio-card studio-card-${generator.id}`} key={generator.id} onClick={() => openGenerator(generator)} aria-label={`Open ${generator.name}`}>
                  <img src={`https://images.unsplash.com/${generator.image}?auto=format&fit=crop&w=1000&q=85`} alt="" loading="lazy" />
                  <span className="studio-card-wash" />
                  <span className="studio-card-panda" aria-hidden="true"><PandaArtwork variant={generator.id} label={`${generator.name} panda illustration`} /></span>
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