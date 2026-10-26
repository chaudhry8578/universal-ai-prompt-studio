import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  server: { middlewareMode: true },
})
const { isValidTaskOutput } = await vite.ssrLoadModule('/server/api/generate.ts')
const { finalizeUgcVideoPrompt } = await vite.ssrLoadModule('/src/ugc-video-prompt.ts')
after(() => vite.close())

test('Google Flow prompts use only the approved @image1 reference and include all required locks', () => {
  const result = finalizeUgcVideoPrompt([
    'TIMELINE: Animate naturally for 15 seconds.',
    'VISUAL: Keep the scene consistent.',
    'ACTION: Animate the visible character and product.',
    'CAMERA: Use a gentle push-in.',
    'DIALOGUE / VOICEOVER: No dialogue.',
    'AUDIO: Natural ambient sound.',
  ].join('\n\n'))

  for (const required of [
    'Use @image1 as the exact provided approved image and authoritative first frame.',
    'Animate the character and product already visible in @image1.',
    'Preserve the exact character identity, face, hairstyle, outfit, product design, branding, accessories, lighting, and background.',
    'Maintain continuity with @image1 throughout the video.',
    'Do not reconstruct the scene, replace the product, or invent additional elements.',
    'Use natural movements and camera motion compatible with @image1.',
    '@image1 is the only image reference; do not use or mention any other image references.',
  ]) assert.ok(result.includes(required), required)

  assert.deepEqual([...new Set(result.match(/@image\w*/gi))], ['@image1'])
  assert.throws(() => finalizeUgcVideoPrompt('Use @image2 as an additional outfit reference.'), /only @image1/)
  assert.throws(() => finalizeUgcVideoPrompt('Use @image3 for the product and @image1 for the video.'), /only @image1/)
})

test('OpenAI UGC video output validation rejects every image reference except @image1', () => {
  const input = { settings: { duration: '15 seconds' } }
  const completePrompt = [
    '@image1 is the exact approved starting image.',
    'TIMELINE: One continuous 15 seconds sequence.',
    'VISUAL: Animate the existing scene.',
    'ACTION: Continue the visible action.',
    'CAMERA: Use natural motion.',
    'DIALOGUE / VOICEOVER: No spoken dialogue and no voiceover. No lip-sync.',
    'AUDIO: Natural ambient sound only; no background music.',
    'No text overlays. No subtitles. No captions.',
  ].join('\n\n')

  assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: completePrompt }), true)
  for (const reference of ['@image2', '@image3', '@image4', '@image10']) {
    assert.equal(isValidTaskOutput('ugc-video-prompts', input, { prompt: `${completePrompt}\n${reference}` }), false, reference)
  }
})

test('UGC image-prompt workflow retains its character, outfit, and product references', async () => {
  const source = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')
  const imagePromptBuilder = source.slice(source.indexOf('function buildImagePrompt()'), source.indexOf('async function generateImagePrompt'))
  assert.match(imagePromptBuilder, /uploads\.character && 'Use @image1/)
  assert.match(imagePromptBuilder, /uploads\.outfit && 'Use @image2/)
  assert.match(imagePromptBuilder, /uploads\.product && 'Use @image3/)

  const videoWorkflow = source.slice(source.indexOf('async function generateVideoPrompts'), source.indexOf('async function copyText'))
  assert.doesNotMatch(videoWorkflow, /approvedImagePrompt: imagePrompt/)
  assert.doesNotMatch(videoWorkflow, /referenceImages:/)
  assert.match(videoWorkflow, /approvedImageReference: '@image1 is the only reference/)
})
