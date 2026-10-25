export type ApiRequest = {
  method?: string
  url?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
}

export type ApiResponse = {
  status(code: number): ApiResponse
  json(value: unknown): void
  setHeader(name: string, value: string): void
}

export type AuthenticatedUser = {
  id: string
  username: string
  role: 'admin' | 'user'
  email: string
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getHeader(req: ApiRequest, name: string): string | undefined {
  const value = req.headers?.[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

export function getCookie(req: ApiRequest, name: string): string | undefined {
  const cookieHeader = getHeader(req, 'cookie')
  if (!cookieHeader) return undefined

  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=')
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(item.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }

  return undefined
}

export function isSameOrigin(req: ApiRequest): boolean {
  const origin = getHeader(req, 'origin')
  if (!origin) return false

  const host = getHeader(req, 'x-forwarded-host') ?? getHeader(req, 'host')
  if (!host) return false

  try {
    return new URL(origin).host.toLowerCase() === host.split(',')[0].trim().toLowerCase()
  } catch {
    return false
  }
}

export function handleApiError(res: ApiResponse, context: string, error: unknown): void {
  if (error instanceof Error && error.name === 'ConfigurationError') {
    res.status(503).json({ error: error.message })
    return
  }

  console.error(`[${context}] Request failed.`, error instanceof Error ? error.message : 'Unknown error')
  res.status(500).json({ error: 'The request could not be completed. Please try again.' })
}
