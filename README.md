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

## Authentication

The panda homepage remains public. The four generators require a current, verified, active account; login revalidates the session before opening a selected generator. Sessions use opaque random values in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie and store only the SHA-256 token hash in PostgreSQL. All mutating browser endpoints require a matching `Origin` header.

Registration requires a Gmail address, username, 12–128 character password, and a one-use administrator-issued code. The server stores only the code hash, binds redemption to one account in a locked transaction, and sends a 24-hour email-verification link. The account is inactive until the link is explicitly confirmed; account activation is still constrained by the 50-active-account database trigger.

Forgot-password responses do not disclose whether an account exists. Verified users receive a 30-minute reset link. Only the token hash is stored. Redeeming the token updates the scrypt password hash, consumes the token, and revokes all existing sessions. Existing accounts without a verified Gmail can use the legacy email-enrollment form, proving their existing username and password before a verification email is sent.

Administrators have a dashboard for creating/listing/revoking access codes, reviewing account/verification state, activating or disabling verified accounts, and viewing daily usage. All corresponding APIs enforce admin role server-side. Administrator bootstrap remains a one-time, bearer-token-protected operation; configure the bootstrap admin Gmail as a server-side variable.

The GPT-5 Mini `/api/generate` endpoint is protected, shares the 20-successful-generation limit across UGC, Faceless, and Storyboard tasks, and uses an atomic PostgreSQL upsert keyed by user and UTC date. It holds the quota update in the same transaction as the provider request, committing only a validated successful response and rolling back provider/network/format failures. AI Drama remains copy-only and does not call `/api/generate`. The optional third-party image-generation services still use their existing client-configured URLs and are not covered by the GPT-5 Mini credit counter; configure those services to enforce their own authorization and usage limits.

### Server-side environment variables

Configure these in Vercel under Project Settings → Environment Variables. Do not prefix them with `VITE_`:

- `DATABASE_URL`: the primary Neon pooled connection URL supplied by the Vercel integration. `STORAGE_DATABASE_URL` is supported as a fallback; if both are set, `DATABASE_URL` takes precedence.
- `AUTH_SECRET`: a randomly generated value with at least 32 characters, used to pseudonymize login-rate-limit keys.
- `ADMIN_BOOTSTRAP_TOKEN`: a random one-time bootstrap bearer token, at least 32 characters.
- `BOOTSTRAP_ADMIN_USERNAME`: the initial administrator's username (3–32 letters, digits, `_` or `-`).
- `BOOTSTRAP_ADMIN_EMAIL`: the initial administrator's Gmail address.
- `BOOTSTRAP_ADMIN_PASSWORD`: the initial administrator password (12–128 characters).
- `RESEND_API_KEY`: server-side Resend API key used only by the email delivery helper.
- `AUTH_EMAIL_FROM`: sender email address on a domain verified with Resend.
- `APP_BASE_URL`: canonical public HTTPS origin used to create verification and reset links.
- `OPENAI_API_KEY`: the existing server-only key used by `/api/generate`.

Generate random secrets locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and enter the output directly in Vercel. Never put secret values in source code, Vite variables, or committed files. After the initial admin is created, remove `ADMIN_BOOTSTRAP_TOKEN`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` from the deployment settings.

### Confirm the schema and bootstrap the administrator

1. Confirm `DATABASE_URL` points to the intended Neon project and branch in the Vercel environment. `STORAGE_DATABASE_URL` is accepted as a fallback.
2. Both `001_auth_and_usage.sql` and `002_email_registration_and_recovery.sql` have already been applied to this database. Do not run `npm run db:migrate`, replay either migration, or drop/recreate any tables. If connecting a different database in the future, first verify its schema and plan its provisioning separately.
3. Configure the database, authentication, Resend, URL, OpenAI, and bootstrap variables server-side. Verify the Resend sending domain and configure SPF, DKIM, and DMARC. Never expose these values through `VITE_` variables.
4. Send one `POST /api/auth/bootstrap` request over HTTPS with a bearer token from `ADMIN_BOOTSTRAP_TOKEN`, an `Origin` header matching the deployment's public origin, and no request body. The username and password are read only from server environment variables. The database records that bootstrap was consumed and rejects subsequent calls.
5. Remove `ADMIN_BOOTSTRAP_TOKEN`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` after the administrator has been created.

Authentication APIs include `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/auth/usage`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, and `POST /api/auth/enroll-email`. Admin APIs include user list/provision/status/delete/password-reset under `/api/admin/users`, access-code list/create/revoke under `/api/admin/access-codes`, and `GET /api/admin/usage?date=YYYY-MM-DD`. Passwords are scrypt hashes. Access codes and email-action tokens are random 256-bit values; only SHA-256 hashes are persisted. Login and auth actions are rate-limited using keyed hashes of request/address identifiers. Inactive or unverified users cannot create a session or call protected generation APIs. The active-account trigger includes the administrator in its 50-account limit.

### Moving the project to another GitHub or Vercel account

Transfer or mirror the source repository to the destination GitHub account, then import that repository into the destination Vercel account as a new project. Reconnect the Neon integration in the destination Vercel project, confirm it supplies `DATABASE_URL` (or `STORAGE_DATABASE_URL` as a fallback), and re-add each server-side secret in the destination project's environment settings. Environment variables and integrations do not move with Git history. If connecting to the existing Neon database, preserve its credentials securely and run the migration only if it has not already been applied. If using a new Neon database, apply the migration there and bootstrap a new admin; do not copy credentials into the repository. Reconfigure domains and deployment settings in the destination Vercel project. Keep the source project and database until the destination deployment is verified.

## Build

```sh
npm run build
```

Run the local identity-helper tests with `node --disable-warning=ExperimentalWarning --test tests/auth-identity.test.mjs`. Database-backed integration, concurrent PostgreSQL quota, email delivery, and live provider tests require configured external services and are not run by the local build.
