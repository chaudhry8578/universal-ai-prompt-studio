import type { ApiRequest, ApiResponse } from '../server/http'
import routeApiRequest from '../server/api-router'

type QueryValue = string | string[] | undefined

function getQuery(url: URL): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {}
  for (const [key, value] of url.searchParams) {
    if (key === '_apiPath') continue
    const previous = query[key]
    query[key] = previous === undefined ? value : Array.isArray(previous) ? [...previous, value] : [previous, value]
  }
  return query
}

function getRouteUrl(url: string | undefined, host: string | undefined): URL {
  return new URL(url ?? '/', `https://${host ?? 'vercel.invalid'}`)
}

function getApiRequest(req: ApiRequest): ApiRequest | undefined {
  const hostHeader = req.headers?.host
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
  const incomingUrl = getRouteUrl(req.url, host)
  const routePath = incomingUrl.searchParams.get('_apiPath')
  if (!routePath) return undefined

  const apiUrl = new URL(`/api/${routePath.replace(/^\/+/, '')}`, incomingUrl.origin)
  for (const [key, value] of incomingUrl.searchParams) {
    if (key !== '_apiPath') apiUrl.searchParams.append(key, value)
  }

  const headers = { ...req.headers }
  if (!headers.host) {
    const forwardedHost = headers['x-forwarded-host']
    headers.host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost ?? incomingUrl.host
  }

  return {
    ...req,
    url: `${apiUrl.pathname}${apiUrl.search}`,
    headers,
    query: getQuery(apiUrl),
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const apiRequest = getApiRequest(req)
    if (!apiRequest) {
      res.status(404).json({ error: 'Not found.' })
      return
    }
    await routeApiRequest(apiRequest, res)
  } catch {
    console.error('[api/router] Request failed.')
    res.status(500).json({ error: 'The request could not be completed. Please try again.' })
  }
}
