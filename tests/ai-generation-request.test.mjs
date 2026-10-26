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

test('UGC video instructions preserve continuity and make dialogue optional', () => {
  const ugcVideo = buildOpenAIRequest('ugc-video-prompts', {
    settings: { duration: '15 seconds', niche: 'Fashion', dialogue: 'None' },
    approvedImagePrompt: 'Approved image prompt',
    referenceImages: { character: true, outfit: true, product: true },
  })
  for (const section of ['TIMELINE:', 'VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:']) {
    assert.ok(ugcVideo.instructions.includes(section), section)
  }
  assert.match(ugcVideo.instructions, /dialogue is optional/i)
  assert.match(ugcVideo.instructions, /fashion modeling/i)
  assert.match(ugcVideo.instructions, /unchanged character identity, outfit, product appearance, and location/i)

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

test('UGC video validation accepts one complete optional-dialogue prompt and rejects incomplete output', () => {
  const input = {
    settings: { duration: '15 seconds' },
    approvedImagePrompt: 'approved image description',
  }
  const prompt = [
    'TIMELINE: Create one complete 15 seconds video.',
    'VISUAL: Continue from the approved image.',
    'ACTION: A natural fashion modeling sequence.',
    'CAMERA: Slow, cinematic tracking shot.',
    'DIALOGUE / VOICEOVER: No dialogue.',
    'AUDIO: Natural ambience.',
  ].join('\n\n')

  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt }), true)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { clips: [{ prompt }] }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: prompt.replace('15 seconds', '10 seconds') }), false)
  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: prompt.replace('AUDIO:', 'SOUND:') }), false)
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
})
