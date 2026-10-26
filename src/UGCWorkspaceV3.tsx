import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  getUgcClipDurations,
  getUgcStyleDialogueInstruction,
  normalizeUgcDialogueMode,
  ugcProductDialogueInstruction,
} from './ugc-video-prompt'

type ReferenceSlot = 'character' | 'outfit' | 'product'
type WorkflowStage = 1 | 2 | 3 | 4 | 5 | 6 | 7
type Duration = '10' | '15' | '20' | '30'
type IdeaResponse = { concepts: string[]; taglishDialogue: string; nicheActions: string[] }

type UGCForm = {
  duration: Duration
  gender: 'Auto' | 'Female' | 'Male'
  ageMode: 'Auto' | 'Manual age'
  age: string
  location: string
  customLocation: string
  niche: string
  action: string
  customAction: string
  style: string
  shotPlanning: 'Auto' | '4 shots' | '5 shots'
  dialogue: 'None' | 'AI-generated Taglish'
  cameraAngles: string[]
  cameraMovement: string
  additionalNotes: string
  productIdea: string
}

const initialUGCForm: UGCForm = {
  duration: '15',
  gender: 'Auto',
  ageMode: 'Auto',
  age: '',
  location: 'Bedroom',
  customLocation: '',
  niche: 'Auto',
  action: 'Review',
  customAction: '',
  style: 'Natural Filipino UGC',
  shotPlanning: 'Auto',
  dialogue: 'AI-generated Taglish',
  cameraAngles: ['Eye-level'],
  cameraMovement: 'Auto-natural',
  additionalNotes: '',
  productIdea: '',
}

const referenceCards: { slot: ReferenceSlot; title: string; label: string; description: string; icon: string }[] = [
  { slot: 'character', title: 'Character reference', label: '@image1', description: 'Lock the creator’s identity to this image.', icon: '✳' },
  { slot: 'outfit', title: 'Outfit reference', label: '@image2', description: 'Preserve the exact outfit design.', icon: '✿' },
  { slot: 'product', title: 'Product reference', label: '@image3', description: 'Preserve packaging and product details.', icon: '◈' },
]

const cameraAngleOptions = ['Eye-level', 'Selfie / POV', 'Close-up', 'Medium shot', 'Wide shot', 'Over-the-shoulder', 'Low angle', 'High angle']
const ideaEndpoint = import.meta.env.VITE_UGC_IDEA_ENDPOINT
const imageEndpoint = import.meta.env.VITE_UGC_IMAGE_ENDPOINT

function isIdeaResponse(result: unknown): result is IdeaResponse {
  if (!result || typeof result !== 'object') return false
  const response = result as Record<string, unknown>
  return Array.isArray(response.concepts) &&
    response.concepts.every((item) => typeof item === 'string') &&
    typeof response.taglishDialogue === 'string' &&
    Array.isArray(response.nicheActions) &&
    response.nicheActions.every((item) => typeof item === 'string')
}

export default function UGCWorkspaceV3() {
  const [form, setForm] = useState(initialUGCForm)
  const [references, setReferences] = useState<Record<ReferenceSlot, File | null>>({ character: null, outfit: null, product: null })
  const [referencePreviews, setReferencePreviews] = useState<Record<ReferenceSlot, string>>({ character: '', outfit: '', product: '' })
  const [stage, setStage] = useState<WorkflowStage>(1)
  const [imagePrompt, setImagePrompt] = useState('')
  const [workflowImage, setWorkflowImage] = useState('')
  const [imageSource, setImageSource] = useState<'generated' | 'uploaded' | ''>('')
  const [approved, setApproved] = useState(false)
  const [changeRequest, setChangeRequest] = useState('')
  const [ideaResult, setIdeaResult] = useState<IdeaResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [videoPrompts, setVideoPrompts] = useState<string[]>([])
  const previewUrls = useRef<string[]>([])
  const imageInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  function makePreview(file: File) {
    const url = URL.createObjectURL(file)
    previewUrls.current.push(url)
    return url
  }

  function updateForm<K extends keyof UGCForm>(key: K, value: UGCForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updateReference(slot: ReferenceSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for this reference.')
      return
    }
    const preview = makePreview(file)
    setReferences((current) => ({ ...current, [slot]: file }))
    setReferencePreviews((current) => ({ ...current, [slot]: preview }))
    setError('')
  }

  function removeReference(slot: ReferenceSlot) {
    setReferences((current) => ({ ...current, [slot]: null }))
    setReferencePreviews((current) => ({ ...current, [slot]: '' }))
  }

  async function requestIdeaAssistant() {
    if (!ideaEndpoint || !form.productIdea.trim()) return
    setIsLoading(true)
    setError('')
    setIdeaResult(null)
    try {
      const response = await fetch(ideaEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIdea: form.productIdea.trim(),
          niche: form.niche,
          requestedOutput: ['creative concepts', 'natural Filipino Taglish dialogue', 'niche-specific actions'],
        }),
      })
      if (!response.ok) throw new Error(`Idea assistant request failed (${response.status}).`)
      const result: unknown = await response.json()
      if (!isIdeaResponse(result)) {
        throw new Error('The idea assistant returned an unexpected response. Expected concepts, taglishDialogue, and nicheActions.')
      }
      setIdeaResult(result)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The idea assistant request failed.')
    } finally {
      setIsLoading(false)
    }
  }

  function applyIdea(concept: string) {
    updateForm('additionalNotes', [form.additionalNotes, concept].filter(Boolean).join('\n'))
  }

  function buildImagePrompt() {
    const location = form.location === 'Custom' ? form.customLocation.trim() : form.location
    const action = form.action === 'Custom' ? form.customAction.trim() : form.action
    const age = form.ageMode === 'Manual age' && form.age ? `${form.age}-year-old` : 'age-appropriate'
    const referencesInPrompt = referenceCards
      .filter(({ slot }) => references[slot])
      .map(({ slot, label, title }) => `${label} (${title}: ${references[slot]?.name}) is the visual reference. Match its ${slot === 'character' ? 'exact character identity and facial features' : slot === 'outfit' ? 'exact outfit design, colors, and fit' : 'exact product shape, label, and packaging'}; do not invent a replacement.`)
    const prompt = [
      `Photorealistic vertical 9:16 UGC still for a ${form.niche.toLowerCase()} product, composed as a believable ${form.style.toLowerCase()} moment.`,
      `Show an ${age} ${form.gender === 'Auto' ? 'Filipino creator' : `${form.gender.toLowerCase()} Filipino creator`} in a real ${location || 'home'} setting, ${action || 'naturally engaging with the product'}.`,
      `Product idea / brief: ${form.productIdea.trim() || 'a genuine first-person product story'}.`,
      ...referencesInPrompt,
      'Natural skin texture, realistic hands and product scale, soft available light, lived-in environmental detail, candid expression, coherent shadows, documentary lens perspective, premium but unretouched realism.',
      'Single still frame, vertical 9:16 crop with natural headroom and clear product visibility. No text, captions, graphics, watermarks, logos beyond the actual product packaging, or artificial beauty filters.',
      form.additionalNotes.trim() && `Additional direction: ${form.additionalNotes.trim()}.`,
    ].filter(Boolean)
    setImagePrompt(prompt.join('\n\n'))
    setStage(2)
    setWorkflowImage('')
    setImageSource('')
    setApproved(false)
    setVideoPrompts([])
    setError('')
    setCopied('')
  }

  async function generateImage() {
    if (!imageEndpoint || !imagePrompt) return
    setIsLoading(true)
    setError('')
    try {
      const body = new FormData()
      body.set('prompt', imagePrompt)
      body.set('aspectRatio', '9:16')
      body.set('duration', form.duration)
      referenceCards.forEach(({ slot }) => {
        const file = references[slot]
        if (file) body.set(slot, file)
      })
      const response = await fetch(imageEndpoint, { method: 'POST', body })
      if (!response.ok) throw new Error(`Image generation failed (${response.status}).`)
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object') throw new Error('The image service returned an unexpected response.')
      const imageResult = result as { imageUrl?: unknown; imageBase64?: unknown; mimeType?: unknown }
      const image = typeof imageResult.imageUrl === 'string'
        ? imageResult.imageUrl
        : typeof imageResult.imageBase64 === 'string'
          ? `data:${typeof imageResult.mimeType === 'string' ? imageResult.mimeType : 'image/png'};base64,${imageResult.imageBase64}`
          : ''
      if (!image) throw new Error('The image service response must include imageUrl or imageBase64.')
      setWorkflowImage(image)
      setImageSource('generated')
      setApproved(false)
      setStage(5)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Image generation failed.')
    } finally {
      setIsLoading(false)
    }
  }

  function uploadWorkflowImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file to review.')
      return
    }
    setWorkflowImage(makePreview(file))
    setImageSource('uploaded')
    setApproved(false)
    setVideoPrompts([])
    setStage(5)
    setError('')
  }

  function requestChanges() {
    if (changeRequest.trim()) setImagePrompt((current) => `${current}\n\nRequested changes: ${changeRequest.trim()}`)
    setWorkflowImage('')
    setImageSource('')
    setApproved(false)
    setVideoPrompts([])
    setStage(2)
  }

  function buildVideoPrompts() {
    if (!approved) return
    const clips = getUgcClipDurations(form.duration)
    const angles = form.cameraAngles.length ? form.cameraAngles : ['Eye-level']
    const action = form.action === 'Custom' ? form.customAction.trim() : form.action
    const location = form.location === 'Custom' ? form.customLocation.trim() : form.location
    const referenceLock = [
      references.character && 'Maintain the exact same person, face, hair, skin tone, and identity as @image1 throughout; never drift or substitute.',
      references.outfit && 'Keep the exact clothing, colors, patterns, accessories, and fit from @image2 in every shot; no wardrobe changes.',
      references.product && 'Keep the exact product, package shape, label, colors, and orientation from @image3; never alter, misspell, or replace its packaging.',
    ].filter(Boolean).join(' ')
    const prompts = clips.map((clipDuration, index) => {
      const shotCount = clipDuration === 5 ? 2 : form.shotPlanning === 'Auto' ? 5 : Number(form.shotPlanning[0])
      const dialogueInstruction = normalizeUgcDialogueMode(form.dialogue) === 'None'
        ? 'No spoken dialogue, voiceover, or lip-sync. No subtitles, captions, or text overlays.'
        : `Generate connected, natural Filipino Gen Z Taglish dialogue with accurate lip-sync. Adapt the speaking personality to the selected UGC style: ${getUgcStyleDialogueInstruction(form.style)} ${ugcProductDialogueInstruction} Keep spoken words to at most ${Math.floor(clipDuration * 2)} for this ${clipDuration}-second clip, fewer when actions need time. Vary phrasing and openings; do not use fixed example scripts, robotic one-liners, or a rigid language ratio. The product idea and additional notes are production instructions that control personality, actions, and visuals and override the default style when explicit; never read them aloud. Preserve exact spoken words only when explicitly requested. Treat Affiliate budol style as an explicit affiliate-style choice, but mention a basket, product link, checkout, or CTA only when a destination is supplied or configured; never invent a link, discount, stock level, or promotion.`
      const clipProgression = index === 0
        ? 'Introduce the creator and give an initial product-specific reaction; do not force a CTA.'
        : index === clips.length - 1
          ? 'Continue naturally with a closing thought; do not repeat the introduction and use a CTA only when appropriate.'
          : 'Continue naturally with a new product detail or styling observation; do not repeat the introduction or force a CTA.'
      const shots = Array.from({ length: shotCount }, (_, shotIndex) => {
        const angle = angles[shotIndex % angles.length]
        const shotAction = shotIndex === 0
          ? index === 0 ? 'open with an immediate, candid hook and establish the creator and setting' : 'continue the previous clip naturally with a new product-focused detail, without reintroducing the creator'
          : shotIndex === shotCount - 1
            ? 'finish with a natural expression and clear product hero moment'
            : `${action.toLowerCase()} with a believable, gentle product interaction`
        return `${shotIndex + 1}. ${angle} — ${shotAction}; maintain realistic hand anatomy, product scale, and spatial continuity.`
      }).join('\n')
      return [
        `GOOGLE FLOW — SEPARATE CLIP ${index + 1} OF ${clips.length} (${clipDuration} SECONDS). Use only this clip duration; do not combine clips.`,
        `Timeline: Begin from the exact approved image. ${index > 0 ? 'Continue the same scene and action naturally from the preceding clip without changing the character, product, location, lighting, or visual style.' : ''} Dialogue progression: ${clipProgression} ${index < clips.length - 1 ? 'End on a natural action beat that flows into the next clip.' : ''}`,
        `Visual: Photorealistic ${form.style.toLowerCase()} UGC in ${location || 'a natural location'} for ${form.niche.toLowerCase()}; vertical 9:16. Match the approved image as the first-frame visual reference. ${referenceLock} Keep the same natural Filipino creator, product, lighting, and scene continuity.`,
        `Action: Actual product and creative brief: ${form.productIdea.trim() || 'Use only the product clearly visible in the approved image.'} Treat this and the additional notes as visual/action production instructions, not dialogue. Apply style requests visually without announcing them, and let explicit manual directions override default UGC style behavior. ${action || 'demonstrate the product naturally'}; relaxed human movement, genuine reactions, realistic product handling, no abrupt gestures. Plan ${shotCount} purposeful shot${shotCount === 1 ? '' : 's'}:\n${shots}`,
        `Camera: ${form.cameraMovement} movement; use selected angles (${angles.join(', ')}) in sequence. Smooth motivated transitions, stable framing, no sudden zooms or impossible cuts.`,
        `Dialogue: ${dialogueInstruction}`,
        `Audio: ${normalizeUgcDialogueMode(form.dialogue) === 'None' ? 'Natural ambient and action sounds only; no speech or voiceover.' : 'Clean natural location sound and clear dialogue only.'} No background music, subtitles, text overlays, added graphics, or watermarks by default. ${form.additionalNotes.trim() ? `Additional production instructions, not dialogue: ${form.additionalNotes.trim()}` : ''}`,
      ].filter(Boolean).join('\n\n')
    })
    setVideoPrompts(prompts)
    setStage(7)
    setCopied('')
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setError('')
    } catch (copyError) {
      setError(copyError instanceof Error ? `Could not copy to clipboard: ${copyError.message}` : 'Could not copy to clipboard.')
    }
  }

  const stages: { number: WorkflowStage; label: string }[] = [
    { number: 1, label: 'Setup' }, { number: 2, label: 'Image prompt' }, { number: 3, label: 'Create image' },
    { number: 4, label: 'Add image' }, { number: 5, label: 'Approve' }, { number: 6, label: 'Video' }, { number: 7, label: 'Clip prompts' },
  ]

  return (
    <section className="ugc-workspace">
      <div className="ugc-intro">
        <div className="ugc-intro-copy">
          <div className="ugc-kicker"><span /> THE CREATOR EDITION · V3</div>
          <h1>Your next great<br /><em>story starts here.</em></h1>
          <p>Shape a natural Filipino UGC vlog, one intentional frame at a time.</p>
          <div className="ugc-intro-note"><span aria-hidden="true">✦</span> IMAGE FIRST. YOUR APPROVAL. THEN MOTION.</div>
        </div>
        <div className="ugc-hero-art" aria-hidden="true">
          <div className="ugc-art-orbit orbit-one" /><div className="ugc-art-orbit orbit-two" />
          <span className="ugc-art-spark spark-one">✦</span><span className="ugc-art-spark spark-two">✳</span>
          <div className="ugc-art-flower"><i /><i /><i /><i /><i /><b /></div>
          <div className="ugc-art-card"><span>YOUR SCENE, YOUR STORY</span><strong>Made to<br />feel real.</strong><i>✷</i></div>
          <div className="ugc-art-caption">01 — CREATOR STUDIO</div>
        </div>
      </div>

      <nav className="ugc-stage-nav" aria-label="UGC creation workflow">
        {stages.map(({ number, label }) => (
          <button key={number} className={stage === number ? 'active' : stage > number ? 'complete' : ''} disabled={number > stage} onClick={() => number < stage && setStage(number)}>
            <span>{number < stage ? '✓' : `0${number}`}</span>{label}
          </button>
        ))}
      </nav>
      {error && <div className="ugc-error" role="alert">{error}</div>}

      {stage === 1 && (
        <>
          <div className="ugc-section-title">
            <div><span className="ugc-step-label">01 / YOUR REFERENCES</span><h2>Set your scene</h2></div>
            <span className="ugc-optional">Reference images stay local unless a configured service is called</span>
          </div>
          <div className="ugc-upload-grid">
            {referenceCards.map(({ slot, title, label, description, icon }) => (
              <div className={`ugc-upload-card ${references[slot] ? 'has-upload' : ''}`} key={slot}>
                <input id={`ugc-reference-${slot}`} className="ugc-file-input" type="file" accept="image/*" onChange={(event) => updateReference(slot, event)} aria-label={`Upload ${label} ${title}`} />
                <label htmlFor={`ugc-reference-${slot}`} className="ugc-upload-visual" title={`Choose ${label} reference`}>
                  {referencePreviews[slot] ? <img src={referencePreviews[slot]} alt={`${label} preview`} /> : <span className={`ugc-upload-icon icon-${slot}`}>{icon}</span>}
                  <span className="ugc-upload-plus" aria-hidden="true">{references[slot] ? '↻' : '+'}</span>
                </label>
                <div className="ugc-upload-text">
                  <strong>{label} · {title}</strong>
                  <span>{references[slot]?.name || description}</span>
                  <small>{references[slot] ? 'CHANGE IMAGE' : 'ADD REFERENCE · PNG, JPG'}</small>
                  {references[slot] && <button className="ugc-remove-reference" onClick={() => removeReference(slot)}>REMOVE {label}</button>}
                </div>
              </div>
            ))}
          </div>

          <div className="ugc-main-grid">
            <div className="ugc-left-column">
              <section className="ugc-panel ugc-settings-panel">
                <div className="ugc-panel-heading"><div><span className="ugc-step-label">02 / VIDEO SETUP</span><h2>Build your vlog</h2></div><span className="ugc-heading-flower" aria-hidden="true">✿</span></div>
                <div className="ugc-settings-grid">
                  <label>DURATION<select value={form.duration} onChange={(event) => updateForm('duration', event.target.value as Duration)}>{['10', '15', '20', '30'].map((duration) => <option key={duration} value={duration}>{duration} seconds</option>)}</select></label>
                  <label>CHARACTER GENDER<select value={form.gender} onChange={(event) => updateForm('gender', event.target.value as UGCForm['gender'])}>{['Auto', 'Female', 'Male'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>CHARACTER AGE<select value={form.ageMode} onChange={(event) => updateForm('ageMode', event.target.value as UGCForm['ageMode'])}><option>Auto</option><option>Manual age</option></select></label>
                  {form.ageMode === 'Manual age' && <label>AGE<input type="number" min="18" max="100" value={form.age} onChange={(event) => updateForm('age', event.target.value)} placeholder="Age 18+" /></label>}
                  <label>LOCATION<select value={form.location} onChange={(event) => updateForm('location', event.target.value)}>{['Bedroom', 'Living room', 'Kitchen', 'Bathroom', 'Backyard', 'Doorway', 'Home studio', 'Cafe', 'Outdoor street', 'Reference location', 'Custom'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  {form.location === 'Custom' && <label>YOUR LOCATION<input value={form.customLocation} onChange={(event) => updateForm('customLocation', event.target.value)} placeholder="Describe the location" /></label>}
                  <label>PRODUCT NICHE<select value={form.niche} onChange={(event) => updateForm('niche', event.target.value)}>{['Auto', 'Fashion', 'Beauty/skincare', 'Footwear', 'Bags/accessories', 'Tech', 'Home/kitchen', 'Fitness', 'Food/drinks', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>CHARACTER ACTION<select value={form.action} onChange={(event) => updateForm('action', event.target.value)}>{['Review', 'Unboxing', 'Demonstration', 'Try-on', 'Reveal', 'Product details', 'Lifestyle', 'Before/after', 'Amazed reaction', 'Custom'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  {form.action === 'Custom' && <label>CUSTOM ACTION<input value={form.customAction} onChange={(event) => updateForm('customAction', event.target.value)} placeholder="Describe the action" /></label>}
                  <label>UGC STYLE<select value={form.style} onChange={(event) => updateForm('style', event.target.value)}>{['Natural Filipino UGC', 'Influencer', 'TikTok vlog', 'Aesthetic lifestyle', 'Playful', 'Honest review', 'Affiliate budol', 'Cinematic realistic'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>SHOT PLANNING<select value={form.shotPlanning} onChange={(event) => updateForm('shotPlanning', event.target.value as UGCForm['shotPlanning'])}><option>Auto</option><option>4 shots</option><option>5 shots</option></select></label>
                  <label>DIALOGUE<select value={normalizeUgcDialogueMode(form.dialogue)} onChange={(event) => updateForm('dialogue', normalizeUgcDialogueMode(event.target.value))}>{['None', 'AI-generated Taglish'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label>CAMERA MOVEMENT<select value={form.cameraMovement} onChange={(event) => updateForm('cameraMovement', event.target.value)}>{['Static', 'Handheld', 'Dolly', 'Pan', 'Tilt', 'Orbit', 'Auto-natural'].map((item) => <option key={item}>{item}</option>)}</select></label>
                  <fieldset className="ugc-angle-fieldset">
                    <legend>CAMERA ANGLES <span>Choose up to 3</span></legend>
                    <div className="ugc-angle-options">{cameraAngleOptions.map((angle) => <label key={angle}><input type="checkbox" checked={form.cameraAngles.includes(angle)} disabled={!form.cameraAngles.includes(angle) && form.cameraAngles.length >= 3} onChange={(event) => updateForm('cameraAngles', event.target.checked ? [...form.cameraAngles, angle] : form.cameraAngles.filter((item) => item !== angle))} />{angle}</label>)}</div>
                  </fieldset>
                  <label className="ugc-setting-wide">ADDITIONAL NOTES · VIBE, LIGHTING, BRAND TONE, ACTIONS, RESTRICTIONS<textarea value={form.additionalNotes} onChange={(event) => updateForm('additionalNotes', event.target.value)} placeholder="Soft window light, warm brand tone, show the cap opening, avoid medical claims..." rows={3} /></label>
                </div>
              </section>
            </div>

            <div className="ugc-right-column">
              <section className="ugc-panel ugc-brief-panel">
                <div className="ugc-panel-heading"><div><span className="ugc-step-label">03 / THE BIG IDEA</span><h2>Product idea</h2></div><span className="ugc-heading-flower" aria-hidden="true">✳</span></div>
                <label className="ugc-field-label" htmlFor="ugc-product-idea">WHAT ARE WE DREAMING UP?</label>
                <textarea id="ugc-product-idea" value={form.productIdea} onChange={(event) => updateForm('productIdea', event.target.value)} placeholder="Product, audience, benefit, or moment to share..." rows={4} />
                <div className="ugc-brief-footer"><span>{form.productIdea.length} characters</span><span>YOUR BRIEF IS USED IN THE IMAGE PROMPT</span></div>
                <div className="ugc-assistant">
                  <div className="ugc-assistant-title"><span>✧</span><div><strong>AI idea assistant</strong><small>REAL BACKEND REQUIRED</small></div><span className="ugc-assistant-badge">{ideaEndpoint ? 'CONNECTED' : 'NOT CONNECTED'}</span></div>
                  <p className="ugc-backend-note">{ideaEndpoint ? 'Request concepts, natural Filipino dialogue, and niche-specific actions from your configured AI service.' : 'No AI ideas are generated here. Configure VITE_UGC_IDEA_ENDPOINT on your server to enable this assistant.'}</p>
                  <button className="ugc-action-button" onClick={requestIdeaAssistant} disabled={!ideaEndpoint || !form.productIdea.trim() || isLoading}>{isLoading ? 'CONTACTING AI SERVICE…' : 'REQUEST AI CONCEPTS'} <b aria-hidden="true">↗</b></button>
                  {ideaResult && (
                    <div className="ugc-idea-results">
                      <h3>Backend-generated concepts</h3>
                      {ideaResult.concepts.map((concept, index) => <button key={`${index}-${concept}`} onClick={() => applyIdea(concept)}>Use concept {index + 1}: {concept}</button>)}
                      <h4>Natural Filipino Taglish dialogue</h4><p>{ideaResult.taglishDialogue}</p>
                      <h4>Niche-specific actions</h4><ul>{ideaResult.nicheActions.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}</ul>
                    </div>
                  )}
                </div>
              </section>
              <button className="ugc-action-button ugc-next-button" disabled={!form.productIdea.trim()} onClick={buildImagePrompt}>BUILD PHOTOREALISTIC IMAGE PROMPT <b aria-hidden="true">↗</b></button>
            </div>
          </div>
        </>
      )}

      {stage >= 2 && (
        <div className="ugc-main-grid ugc-workflow-grid">
          <section className="ugc-panel">
            <div className="ugc-panel-heading"><div><span className="ugc-step-label">STAGE 2 / IMAGE FIRST</span><h2>Vertical 9:16 image prompt</h2></div></div>
            {stage > 2 && <button className="ugc-secondary-button" onClick={() => setStage(1)}>← EDIT SETUP</button>}
            <div className="ugc-prompt-text">{imagePrompt}</div>
            <div className="ugc-prompt-actions">
              <button className="ugc-copy-button" onClick={() => copyText(imagePrompt, 'image-prompt')}>{copied === 'image-prompt' ? 'COPIED ✓' : 'COPY IMAGE PROMPT'}</button>
              {stage === 2 && <button className="ugc-approve-button" onClick={() => setStage(3)}>CONTINUE TO IMAGE OPTIONS ↗</button>}
            </div>
          </section>
        </div>
      )}

      {stage === 3 && (
        <section className="ugc-panel ugc-stage-panel">
          <div className="ugc-panel-heading"><div><span className="ugc-step-label">STAGE 3 / CREATE IMAGE</span><h2>Connect your image service</h2></div></div>
          <p>{imageEndpoint ? 'Your configured image service can generate an image using the prompt and uploaded references.' : 'Image generation is not connected. Export the prompt and upload an image generated with your preferred image tool.'}</p>
          <div className="ugc-prompt-actions">
            <button className="ugc-action-button" disabled={!imageEndpoint || isLoading} onClick={generateImage}>{isLoading ? 'GENERATING IMAGE…' : imageEndpoint ? 'GENERATE IMAGE' : 'IMAGE SERVICE NOT CONNECTED'}</button>
            <button className="ugc-approve-button" onClick={() => setStage(4)}>UPLOAD EXTERNALLY GENERATED IMAGE ↗</button>
          </div>
        </section>
      )}

      {stage === 4 && (
        <section className="ugc-panel ugc-stage-panel">
          <div className="ugc-panel-heading"><div><span className="ugc-step-label">STAGE 4 / ADD IMAGE</span><h2>Bring your image into the studio</h2></div></div>
          <p>Choose the image you created with the exported prompt. It will be previewed locally and is not sent to an AI service.</p>
          <input ref={imageInput} className="ugc-file-input" type="file" accept="image/*" onChange={uploadWorkflowImage} aria-label="Upload externally generated image" />
          <button className="ugc-action-button ugc-upload-result-button" onClick={() => imageInput.current?.click()}>CHOOSE IMAGE TO REVIEW ↗</button>
          <button className="ugc-secondary-button" onClick={() => setStage(3)}>← BACK TO IMAGE OPTIONS</button>
        </section>
      )}

      {stage === 5 && workflowImage && (
        <section className="ugc-panel ugc-stage-panel">
          <div className="ugc-panel-heading"><div><span className="ugc-step-label">STAGE 5 / YOUR APPROVAL</span><h2>Review your image</h2></div></div>
          <p>{imageSource === 'uploaded' ? 'Externally generated image · local preview' : 'Image returned by your configured image service'}</p>
          <img className="ugc-workflow-image" src={workflowImage} alt="Image for UGC vlog review" />
          <div className="ugc-review-actions">
            <button className="ugc-approve-button" onClick={() => { setApproved(true); setStage(6) }}>APPROVE IMAGE · UNLOCK VIDEO PROMPT</button>
            <button className="ugc-secondary-button" onClick={requestChanges}>REQUEST CHANGES</button>
          </div>
          <label className="ugc-field-label ugc-change-label">CHANGE REQUEST<textarea value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} placeholder="What should change? Add a note before requesting a revised image prompt." rows={2} /></label>
        </section>
      )}

      {stage === 6 && approved && (
        <section className="ugc-panel ugc-stage-panel">
          <div className="ugc-panel-heading"><div><span className="ugc-step-label">STAGE 6 / VIDEO PROMPTS</span><h2>Your image is approved</h2></div></div>
          <p>Build structured Google Flow prompts from your setup. This prompt builder is local and does not call an AI service.</p>
          <div className="ugc-video-gate unlocked"><div className="ugc-video-gate-copy"><span className="ugc-video-symbol" aria-hidden="true">✦</span><span><strong>{form.duration} seconds · {getUgcClipDurations(form.duration).length} clip{getUgcClipDurations(form.duration).length === 1 ? '' : 's'}</strong><small>{form.duration === '15' ? '10-second prompt + separate 5-second segment; use if supported or trim as needed.' : `${form.duration} seconds split into separate 10-second prompts.`}</small></span></div></div>
          <button className="ugc-video-button" onClick={buildVideoPrompts}>GENERATE GOOGLE FLOW CLIP PROMPTS ↗</button>
        </section>
      )}

      {stage === 7 && videoPrompts.length > 0 && (
        <section className="ugc-panel ugc-stage-panel">
          <div className="ugc-panel-heading"><div><span className="ugc-step-label">STAGE 7 / GOOGLE FLOW</span><h2>Your clip-by-clip prompts</h2></div></div>
          <p>Prompt builder output · not AI-generated. Each clip is independent and ready to copy.</p>
          {videoPrompts.map((prompt, index) => (
            <article className="ugc-clip-card" key={index}>
              <div className="ugc-clip-heading">              <h3>Clip {index + 1} · {getUgcClipDurations(form.duration)[index]} seconds</h3><button className="ugc-copy-button" onClick={() => copyText(prompt, `clip-${index}`)}>{copied === `clip-${index}` ? 'COPIED ✓' : 'COPY CLIP PROMPT'}</button></div>
              <pre>{prompt}</pre>
            </article>
          ))}
          <button className="ugc-secondary-button" onClick={() => setStage(6)}>← BACK TO VIDEO SETUP</button>
        </section>
      )}
      {stage < 7 && <footer className="ugc-footer"><span>UNIVERSAL / CREATOR STUDIO V3</span><span>MADE WITH A LITTLE MORE HEART <i>♡</i></span></footer>}
    </section>
  )
}
