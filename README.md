# Universal AI Prompt Studio

Universal AI Prompt Studio is a cinematic prompt-generation app. The UGC Vlog Generator V3 works without a provider by building clearly labeled prompt templates and supporting external image uploads. It never labels those templates as AI-generated or inspects uploaded image contents.

## Optional UGC AI backend

Set `VITE_UGC_AI_API_URL` to a trusted server-side API base URL to enable real AI actions. Keep provider credentials on that server; do not put API keys in Vite variables or browser code. The configured server must provide these routes:

| Route | Request | Response |
| --- | --- | --- |
| `POST /idea` | JSON `{ productIdea, niche, action, style, request }` | JSON `{ content: string }` |
| `POST /image-prompt` | JSON `{ brief, settings, referenceNames }` | JSON `{ prompt: string }` |
| `POST /images` | Multipart `prompt`, `changeRequest`, `settings`, and optional `character`, `outfit`, `product` image files | JSON `{ imageUrl: string }` |
| `POST /video-prompts` | JSON `{ brief, settings, approvedImagePrompt, changeRequest }` | JSON `{ clips: [{ prompt: string }] }` |

Video prompt responses must contain one clip for 10 seconds, two for 15 seconds, two for 20 seconds, and three for 30 seconds. Each `prompt` must include `VISUAL:`, `ACTION:`, `CAMERA:`, `DIALOGUE:`, and `AUDIO:` sections. Implement CORS, authentication, validation, and provider error handling on the server as appropriate for your deployment.

## Optional Storyboard AI backend

The Storyboard Generator uses the same trusted server-side base URL, `VITE_UGC_AI_API_URL`. Provider keys must remain on the server. Without a configured backend, the storyboard plan is a clearly labeled structured draft and image-generation actions remain unavailable; image prompts and video prompts can still be assembled locally.

Implement these additional routes to enable real Storyboard AI and image generation:

| Route | Request | Response |
| --- | --- | --- |
| `POST /storyboard/enhance-idea` | JSON `{ idea, references, settings, productIdentityLock }` | JSON `{ idea: string }` |
| `POST /storyboard/choose-settings` | Multipart `context` JSON and optional `product`, `character`, `outfit`, `location` image files | JSON `{ settings: { mode, style, location } }` using supported UI option names |
| `POST /storyboard/choose-audio` | JSON `context` with the active storyboard settings | JSON `{ mode: "No Dialogue" \| "Character Dialogue" \| "Voiceover", rationale: string }` |
| `POST /storyboard/plan` | Multipart `context` JSON and optional reference image files | JSON `{ storyboards: [{ title, concept, panels: [{ start, end, description, camera, action, dialogue }] }] }` |
| `POST /storyboard/images` | Multipart `prompt`, `context` JSON, and optional reference image files | JSON `{ imageUrl: string }` |
| `POST /storyboard/scenes` | Multipart `prompt`, `context` JSON, and optional reference image files | JSON `{ imageUrl: string }` |

Each planned storyboard must contain exactly six panels with contiguous numeric timestamps from `0` to `10` seconds. The client validates segment count and timelines before accepting an AI plan. The app does not render video; its video prompts are assembled locally after all six scene images for a storyboard have been individually approved. A compatible video provider and any required editing/trim step must be integrated separately.
