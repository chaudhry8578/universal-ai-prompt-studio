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
