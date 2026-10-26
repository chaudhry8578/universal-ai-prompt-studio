const approvedImageLock = 'IMAGE-TO-VIDEO STARTING IMAGE: Use @image1 as the exact provided approved image and authoritative first frame. Animate the character and product already visible in @image1. Preserve the exact character identity, face, hairstyle, outfit, product design, branding, accessories, lighting, and background. Maintain continuity with @image1 throughout the video. Do not reconstruct the scene, replace the product, or invent additional elements. Use natural movements and camera motion compatible with @image1. @image1 is the only image reference; do not use or mention any other image references.'

export function finalizeUgcVideoPrompt(prompt: string): string {
  if (!prompt.trim()) throw new Error('The Google Flow video prompt cannot be empty.')
  if ((prompt.match(/@image\w*/gi) ?? []).some((reference) => !/^@image1$/i.test(reference))) {
    throw new Error('The Google Flow video prompt can use only @image1. Remove other image references and try again.')
  }
  return `${approvedImageLock}\n\n${prompt.trim()}`
}
