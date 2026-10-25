# Universal AI Prompt Studio

Universal AI Prompt Studio is a Vite/React creative prompt-generation app. It preserves the UGC, Faceless, Storyboard, and AI Drama workflows. AI Drama remains a copyable master prompt and does not make API calls.

## OpenAI text generation

AI text and prompt requests are sent from the browser to the same-origin `POST /api/generate` Vercel serverless function. The function reads `OPENAI_API_KEY` from the server environment and uses only `gpt-5-mini`. Never add the key to Vite variables or frontend code.

In Vercel, set `OPENAI_API_KEY` in the project’s server-side environment variables and deploy the project. Vercel serves the Vite frontend and the `api/` function on the same origin. For local development with serverless-function support, use the Vercel CLI (`vercel dev`) and configure `OPENAI_API_KEY` in the local Vercel environment. `npm run dev` starts only Vite; its local prompt templates remain available if `/api/generate` is unavailable.

Supported text tasks are UGC concepts, UGC image prompts, UGC video prompts, Faceless product-image prompts, and Storyboard idea enhancement, setting selection, audio selection, and plan generation. The API accepts text and reference filenames only. Uploaded reference images remain available for preview and optional configured image services, but are not analyzed by this OpenAI text endpoint.

## Optional image-generation services

`gpt-5-mini` is used for text only. The existing optional image-generation workflows require a separate image service:

- `VITE_UGC_IMAGE_ENDPOINT` can point to an image service for UGC or Faceless image generation.
- `VITE_UGC_AI_API_URL` remains supported as a legacy base URL for existing image routes (`/images`, `/storyboard/images`, and `/storyboard/scenes`). It is not used for OpenAI text generation.

Keep any credentials for third-party image services on their server, not in Vite variables. If an image service is not configured, the existing external-image upload/review workflows and prompt copying remain available; the app does not simulate generated images.

## Local fallbacks and references

UGC and Faceless expose local prompt templates that are explicitly labeled as not AI-generated. Storyboard exposes a local structured draft labeled as not AI-generated. AI request failures are shown as errors and are not relabeled as successful AI output. Reference image uploads remain intact, and the app does not claim that AI inspected images unless a separate image service actually does so.

## Build

```sh
npm run build
```
