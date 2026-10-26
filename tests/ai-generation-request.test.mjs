import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  server: { middlewareMode: true },
})
const { buildOpenAIRequest } = await vite.ssrLoadModule('/server/api/generate.ts')
after(() => vite.close())

const generationTasks = [
  'ugc-idea',
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
    assert.deepEqual(request.text, { format: { type: 'json_object' } }, task)
    assert.equal(request.max_output_tokens, task === 'storyboard-plan' ? 6000 : 2500, task)
  }
})

test('JSON-mode request instructions retain UGC video and storyboard production locks', () => {
  const ugcVideo = buildOpenAIRequest('ugc-video-prompts', { clipDurations: [10] })
  for (const section of ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE:', 'AUDIO:']) {
    assert.ok(ugcVideo.instructions.includes(section), section)
  }

  const storyboardVideo = buildOpenAIRequest('storyboard-video-prompt', { approvedPlan: true })
  for (const section of ['VISUAL:', 'ACTION:', 'CAMERA:', 'DIALOGUE / VOICEOVER:', 'AUDIO:', 'TIMELINE:']) {
    assert.ok(storyboardVideo.instructions.includes(section), section)
  }
  assert.match(storyboardVideo.instructions, /identity lock/i)
})
