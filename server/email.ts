import { ConfigurationError } from './database'

function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL
  if (!configured) throw new ConfigurationError('APP_BASE_URL is not configured on the server.')
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new ConfigurationError('APP_BASE_URL must be a valid HTTPS origin.')
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ConfigurationError('APP_BASE_URL must use HTTPS.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigurationError('APP_BASE_URL must not contain credentials, a query, or a fragment.')
  }
  return url.origin
}

function getEmailConfiguration(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.AUTH_EMAIL_FROM
  if (!apiKey || !from) {
    throw new ConfigurationError('RESEND_API_KEY and AUTH_EMAIL_FROM must be configured on the server.')
  }
  if (apiKey.length < 16 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) {
    throw new ConfigurationError('Configure a valid Resend API key and sender address.')
  }
  return { apiKey, from }
}

export async function sendAuthEmail(to: string, subject: string, text: string): Promise<void> {
  const { apiKey, from } = getEmailConfiguration()
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  })
  if (!response.ok) {
    throw new Error(`Email delivery provider returned status ${response.status}.`)
  }
}

export function createActionUrl(path: string, token: string, parameter = 'token'): string {
  const url = new URL(path, getAppBaseUrl())
  url.searchParams.set(parameter, token)
  return url.toString()
}
