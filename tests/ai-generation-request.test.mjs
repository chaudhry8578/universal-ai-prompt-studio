import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  server: { middlewareMode: true },
})
const { buildOpenAIRequest, isValidTaskOutput, parseOpenAIOutput } = await vite.ssrLoadModule('/server/api/generate.ts')
const {
  buildUgcVideoPrompt,
  finalizeUgcVideoPrompt,
  getUgcClipDurations,
  normalizeUgcDialogueMode,
} = await vite.ssrLoadModule('/src/ugc-video-prompt.ts')
after(() => vite.close())

const generationTasks = [
  'ugc-image-prompt',
  'ugc-video-prompts',
  'faceless-image-prompt',
  'storyboard-enhance-idea',
  'storyboard-choose-settings',
  'storyboard-choose-audio',
  'storyboard-plan',
  'storyboard-video-prompt',
]

test('GPT-5 Mini JSON-mode requests include JSON in the input message for every generator task', () => {
  for (const task of generationTasks) {
    const taskInput = { idea: 'A test product', clipDurations: [10], explicitChoice: 'preserve me' }
    const request = buildOpenAIRequest(task, taskInput)

    assert.equal(request.model, 'gpt-5-mini', task)
    assert.match(request.input, /\bjson\b/i, task)
    assert.ok(request.input.includes(JSON.stringify(taskInput)), task)
    assert.match(request.instructions, /\bjson\b/i, task)
    if (task === 'ugc-video-prompts') {
      assert.deepEqual(request.text.format, {
        type: 'json_schema',
        name: 'ugc_google_flow_video_prompt',
        strict: true,
        schema: {
          type: 'object',
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
          additionalProperties: false,
        },
      })
    } else {
      assert.deepEqual(request.text, { format: { type: 'json_object' } }, task)
    }
    assert.equal(
      request.max_output_tokens,
      task === 'storyboard-plan' ? 6000 : task === 'ugc-video-prompts' ? 3500 : 2500,
      task,
    )
  }
})

test('UGC video instructions preserve continuity and enforce selected dialogue and text rules', () => {
  const ugcVideo = buildOpenAIRequest('ugc-video-prompts', {
    settings: { duration: '15 seconds', niche: 'Fashion', dialogue: 'None' },
    approvedImageReference: '@image1 only',
  })
  for (const section of ['TIMELINE:', 'VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:']) {
    assert.ok(ugcVideo.instructions.includes(section), section)
  }
  assert.match(ugcVideo.instructions, /dialogue is None/i)
  assert.match(ugcVideo.instructions, /no spoken dialogue, no voiceover, no lip-sync or speech-like mouth movements, no subtitles, no captions, no text overlays/i)
  assert.match(ugcVideo.instructions, /preserve the exact character identity, face, hairstyle, outfit.*lighting, and background, maintaining continuity/is)
  assert.match(ugcVideo.instructions, /never add text overlays, subtitles, captions, floating promotional text, or background music by default/i)
  assert.match(ugcVideo.instructions, /treat the user brief and additional notes as visual\/action production instructions, not spoken dialogue/i)
  assert.match(ugcVideo.instructions, /natural Filipino Taglish speech relevant to the product and scene/i)
  assert.doesNotMatch(ugcVideo.instructions, /elevenlabs/i)
  const aiDialogueVideo = buildOpenAIRequest('ugc-video-prompts', {
    settings: { duration: '15 seconds', dialogue: 'AI-generated Taglish' },
  })
  assert.match(aiDialogueVideo.instructions, /natural Filipino Taglish conversation.*accurate lip-sync/i)
  assert.match(aiDialogueVideo.instructions, /at most 30 words/i)

  const storyboardVideo = buildOpenAIRequest('storyboard-video-prompt', { approvedPlan: true })
  for (const section of ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:', 'TIMELINE:']) {
    assert.ok(storyboardVideo.instructions.includes(section), section)
  }
  assert.match(storyboardVideo.instructions, /identity lock/i)
})

test('Responses API structured output parser handles output_text and per-message text', () => {
  const expected = { prompt: 'A complete cinematic prompt.' }
  assert.deepEqual(parseOpenAIOutput({ output_text: JSON.stringify(expected) }), expected)
  assert.deepEqual(parseOpenAIOutput({
    output: [
      { type: 'reasoning', content: [] },
      { type: 'message', content: [{ type: 'output_text', text: '{"prompt":' }, { type: 'output_text', text: '"Complete prompt."}' }] },
    ],
  }), { prompt: 'Complete prompt.' })
  assert.equal(parseOpenAIOutput({ output: [{ content: [{ type: 'output_text', text: 'not JSON' }] }] }), undefined)
  assert.equal(parseOpenAIOutput({ output: [{ content: [{ type: 'output_text', text: '[]' }] }] }), undefined)
})

test('UGC video validation accepts only the approved image reference and rejects incomplete output', () => {
  const input = {
    settings: { duration: '15 seconds', dialogue: 'None' },
    approvedImageReference: '@image1 only',
  }
  const prompt = buildUgcVideoPrompt(ugcPromptSettings, 'A model presents a handbag already in hand')

  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt }), true)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { clips: [{ prompt }] }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: `${prompt}\nUse @image2 as another reference.` }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: `${prompt}\nUse @image9 as another reference.` }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: prompt.replace('15 seconds', '10 seconds') }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: prompt.replace('AUDIO:', 'SOUND:') }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, {
    prompt: prompt.replace('No spoken dialogue.', 'Natural dialogue.'),
  }), false)
  const taglishInput = {
    settings: { ...input.settings, dialogue: 'AI-generated Taglish' },
    approvedImagePrompt: input.approvedImagePrompt,
  }
  const taglishPrompt = buildUgcVideoPrompt(
    { ...ugcPromptSettings, dialogue: 'AI-generated Taglish' },
    'A model presents a handbag already in hand',
  )
  assert.equal(isValidTaskOutput('ugc-video-prompts', taglishInput, { prompt: taglishPrompt }), true)
  assert.equal(isValidTaskOutput('ugc-video-prompts', taglishInput, {
    prompt: taglishPrompt.replace('accurate lip-sync', 'natural timing'),
  }), false)
})

const ugcPromptSettings = {
  duration: '15 seconds',
  style: 'Cinematic realistic',
  niche: 'Fashion',
  action: 'Try-on',
  customAction: '',
  location: 'Bedroom',
  customLocation: '',
  cameraAngles: ['Eye-level', 'Close-up'],
  cameraMovement: 'Dolly',
  shotPlan: 'Auto',
  dialogue: 'None',
  notes: '',
}

test('UGC dialogue choices exclude voiceover vendors and manual on-camera dialogue', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const ugcWorkspace = source.slice(source.indexOf('function UGCWorkspace()'), source.indexOf('type FacelessReference'))
  const choiceLine = ugcWorkspace.match(/optionSelect\('DIALOGUE',[^\n]+/)
  assert.ok(choiceLine)
  assert.match(choiceLine[0], /\['None', 'AI-generated Taglish'\]/)
  assert.doesNotMatch(ugcWorkspace, /Manual on-camera dialogue|manualDialogue|ElevenLabs/i)
  assert.match(source, /dialogue: 'None'/)

  const v3 = await readFile(new URL('../src/UGCWorkspaceV3.tsx', import.meta.url), 'utf8')
  assert.match(v3, /\['None', 'AI-generated Taglish'\]/)
  assert.doesNotMatch(v3, /Manual on-camera dialogue|manualDialogue|ElevenLabs/i)

  const v3VideoGeneration = v3.slice(v3.indexOf('function buildVideoPrompts()'), v3.indexOf('async function copyText'))
  assert.match(v3VideoGeneration, /if \(!approved\) return/)
  assert.match(v3VideoGeneration, /getUgcStyleDialogueInstruction\(form\.style\)/)
  assert.match(v3VideoGeneration, /form\.productIdea\.trim\(\)/)
  assert.match(v3VideoGeneration, /Math\.floor\(clipDuration \* 2\)/)
  assert.match(v3VideoGeneration, /do not repeat the introduction/)
  assert.match(v3, /{stage === 6 && approved/)
  assert.match(v3, /copyText\(prompt, `clip-\$\{index\}`\)/)
})

test('UGC duration selection creates independent 10-second clips with a separate 5-second remainder', () => {
  assert.deepEqual(getUgcClipDurations('10 seconds'), [10])
  assert.deepEqual(getUgcClipDurations('15 seconds'), [10, 5])
  assert.deepEqual(getUgcClipDurations('20 seconds'), [10, 10])
  assert.deepEqual(getUgcClipDurations('30 seconds'), [10, 10, 10])
  assert.throws(() => getUgcClipDurations('12 seconds'), /Unsupported UGC video duration/)
})

test('removed dialogue modes normalize safely to None', () => {
  assert.equal(normalizeUgcDialogueMode('None'), 'None')
  assert.equal(normalizeUgcDialogueMode('AI-generated Taglish'), 'AI-generated Taglish')
  for (const legacyMode of ['Manual Dialogue', 'Manual on-camera dialogue', 'ElevenLabs Voiceover', undefined]) {
    assert.equal(normalizeUgcDialogueMode(legacyMode), 'None')
  }

  const request = buildOpenAIRequest('ugc-video-prompts', {
    settings: { duration: '10 seconds', dialogue: 'ElevenLabs Voiceover' },
  })
  assert.match(request.input, /"dialogue":"None"/)
  assert.match(request.instructions, /dialogue is None/i)
})

test('UGC video prompt uses only the approved image while preserving all visible subject details', () => {
  const prompt = buildUgcVideoPrompt(ugcPromptSettings, 'A model presents a handbag already in hand')

  for (const required of [
    'Use @image1 as the exact provided approved image and authoritative first frame.',
    'Animate the character and product already visible in @image1.',
    'Preserve the exact character identity, face, hairstyle, outfit, product design, branding, accessories, lighting, and background.',
    'Maintain continuity with @image1 throughout the video.',
    'Do not reconstruct the scene, replace the product, or invent additional elements.',
    'Use natural movements and camera motion compatible with @image1.',
    '@image1 is the only image reference; do not use or mention any other image references.',
    'No spoken dialogue.',
    'No voiceover.',
    'No subtitles',
    'No captions',
    'No text overlays',
    'No background music',
    'Natural ambient',
    '@image1',
    'hair, skin tone, body proportions',
    'original location, lighting, and composition',
    'never make the character retrieve it',
  ]) assert.ok(prompt.includes(required), required)
  assert.deepEqual([...new Set(prompt.match(/@image\w*/gi))], ['@image1'])
  assert.doesNotMatch(prompt, /ElevenLabs/i)
})

test('UGC AI prompts are locked to @image1 and preserve the multiple-reference image prompt workflow', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const imagePromptBuilder = source.slice(source.indexOf('function buildImagePrompt()'), source.indexOf('async function generateImagePrompt'))
  assert.match(imagePromptBuilder, /uploads\.character && 'Use @image1/)
  assert.match(imagePromptBuilder, /uploads\.outfit && 'Use @image2/)
  assert.match(imagePromptBuilder, /uploads\.product && 'Use @image3/)

  const withApprovedLock = finalizeUgcVideoPrompt('VISUAL: Natural motion.')
  assert.match(withApprovedLock, /^IMAGE-TO-VIDEO STARTING IMAGE: Use @image1/)
  assert.deepEqual([...new Set(withApprovedLock.match(/@image\w*/gi))], ['@image1'])
  assert.throws(() => finalizeUgcVideoPrompt('VISUAL: Use @image2 as the outfit reference.'), /only @image1/)
})

test('UGC AI Taglish mode adds duration-appropriate speech and accurate lip-sync', () => {
  const prompt = buildUgcVideoPrompt(
    { ...ugcPromptSettings, dialogue: 'AI-generated Taglish' },
    'A model presents a handbag already in hand',
  )

  assert.match(prompt, /connected, natural Filipino Taglish conversation in a modern Gen Z creator voice/i)
  assert.match(prompt, /Natural, expressive, confident and understated/)
  assert.match(prompt, /accurate lip-sync/)
  assert.match(prompt, /30 spoken words maximum for this 15 seconds clip/)
  assert.match(prompt, /brief and additional notes as production instructions for personality, actions, and visuals/i)
  assert.match(prompt, /Never announce or read out those instructions/)
  assert.match(prompt, /No text overlays/)
  assert.match(prompt, /No subtitles/)
  assert.match(prompt, /No captions/)
  assert.match(prompt, /No floating promotional text/)
  assert.match(prompt, /No background music unless explicitly requested/)
  assert.doesNotMatch(prompt, /ElevenLabs/i)
})

test('UGC Taglish dialogue adapts to all eight unchanged styles in local and AI request prompts', () => {
  const styles = [
    ['Natural Filipino UGC', /Relaxed, friendly, believable everyday Filipino conversation/],
    ['Influencer', /Confident, polished, expressive and engaging modern Taglish/],
    ['TikTok vlog', /Authentic Filipino Gen Z creator energy/],
    ['Aesthetic lifestyle', /Soft, relaxed, fashionable and conversational/],
    ['Playful', /Funny, energetic, teasing and naturally entertaining/],
    ['Honest review', /Straightforward, genuine, realistic and conversational/],
    ['Affiliate budol', /Persuasive but natural Filipino TikTok affiliate delivery/],
    ['Cinematic realistic', /Natural, expressive, confident and understated/],
  ]

  for (const [style, personality] of styles) {
    const settings = { ...ugcPromptSettings, style, duration: '10 seconds', dialogue: 'AI-generated Taglish' }
    const prompt = buildUgcVideoPrompt(settings, 'A creator styles visible white sneakers with a casual outfit')
    assert.match(prompt, personality, `${style} local prompt personality`)

    const request = buildOpenAIRequest('ugc-video-prompts', {
      settings,
      brief: 'A creator styles visible white sneakers with a casual outfit',
    })
    assert.match(request.instructions, personality, `${style} AI instruction personality`)
    assert.ok(request.input.includes(`"style":"${style}"`), `${style} is passed to the AI request`)
  }
})

test('UGC dialogue stays product-specific, respects manual directions, and progresses across clips', () => {
  const manualBrief = 'Maangas delivery, Korean-inspired street styling, and say "Ang ganda ng details!"'
  const clips = [1, 2, 3].map((index) => buildUgcVideoPrompt(
    { ...ugcPromptSettings, duration: '10 seconds', dialogue: 'AI-generated Taglish' },
    `A creator presents visible sneakers with a white outfit. ${manualBrief}`,
    { index, total: 3 },
  ))

  assert.match(clips[0], /footwear design, color and outfit styling/)
  assert.match(clips[0], /Never invent specifications, comfort or performance claims/)
  assert.match(clips[0], /Treat the brief and additional notes as production instructions/)
  assert.match(clips[0], /If the user explicitly requests exact spoken words, preserve those words verbatim/)
  assert.match(clips[0], /Introduce the creator and give an initial, product-specific reaction/)
  assert.match(clips[1], /adding a new product detail or styling observation/)
  assert.match(clips[2], /add a concise closing thought/)

  for (const [index, prompt] of clips.entries()) {
    assert.match(prompt, new RegExp(`One separate 10 seconds image-to-video clip, clip ${index + 1} of 3`))
    for (const section of ['TIMELINE:', 'VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:']) {
      assert.ok(prompt.includes(section), `clip ${index + 1} includes ${section}`)
    }
  }
})

test('UGC prompt dialogue None remains silent and 15-second duration keeps its 10+5 split', () => {
  const nonePrompt = buildUgcVideoPrompt(
    { ...ugcPromptSettings, duration: '10 seconds', dialogue: 'None' },
    'A creator demonstrates a skincare product',
  )
  assert.match(nonePrompt, /No spoken dialogue/)
  assert.match(nonePrompt, /No voiceover/)
  assert.match(nonePrompt, /No lip-sync/)
  assert.deepEqual(getUgcClipDurations('15 seconds'), [10, 5])

  const fiveSecondClip = buildUgcVideoPrompt(
    { ...ugcPromptSettings, duration: '5 seconds', dialogue: 'AI-generated Taglish' },
    'A creator demonstrates visible skincare application',
    { index: 2, total: 2 },
  )
  assert.match(fiveSecondClip, /10 spoken words maximum for this 5 seconds clip/)
})

test('UGC workspace skips concepts and keeps the image approval and revision controls', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const ugcWorkspace = source.slice(source.indexOf('function UGCWorkspace()'), source.indexOf('type FacelessReference'))

  assert.doesNotMatch(ugcWorkspace, /requestIdea|ideaResult|GENERATE CREATIVE CONCEPTS|AI-GENERATED CONCEPTS/)
  assert.match(ugcWorkspace, /GENERATE COMPLETE IMAGE PROMPT/)
  assert.match(ugcWorkspace, /APPROVE IMAGE/)
  assert.match(ugcWorkspace, /REQUEST CHANGES/)
  assert.match(ugcWorkspace, /GENERATE GOOGLE FLOW VIDEO PROMPT/)
  assert.match(ugcWorkspace, /COPY VIDEO PROMPT/)
  assert.match(ugcWorkspace, /Image approved/)
})

test('UGC video generation stays behind image approval and provides one copyable prompt per clip', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const ugcWorkspace = source.slice(source.indexOf('function UGCWorkspace()'), source.indexOf('type FacelessReference'))
  const videoGeneration = ugcWorkspace.slice(ugcWorkspace.indexOf('async function generateVideoPrompts'), ugcWorkspace.indexOf('async function copyText'))
  assert.match(videoGeneration, /if \(!approved \|\| !imagePrompt\) return/)
  assert.match(videoGeneration, /getUgcClipDurations\(settings\.duration\)/)
  assert.match(videoGeneration, /clipDurations\.map/)
  assert.match(videoGeneration, /setClips\(prompts\)/)
  assert.match(ugcWorkspace, /disabled=\{!approved \|\| !!busy\}/)
  assert.match(ugcWorkspace, /copyText\(clip\.prompt, `clip-\$\{index\}`\)/)
  assert.match(ugcWorkspace, /settings\.duration === '15 seconds'.*separate 5-second segment/)
  assert.match(videoGeneration, /productionInstructionsAreNotDialogue: true/)
})
