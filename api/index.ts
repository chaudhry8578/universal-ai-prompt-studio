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

async function getBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return undefined
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) return undefined

  try {
    return await request.json() as unknown
  } catch {
    throw new SyntaxError('Request body must contain valid JSON.')
  }
}

function createResponseAdapter(): {
  response: ApiResponse
  toResponse(): Response
} {
  let status = 200
  let body: string | undefined
  const headers = new Headers()
  const response: ApiResponse = {
    status(code) {
      status = code
      return response
    },
    json(value) {
      body = JSON.stringify(value)
      headers.set('content-type', 'application/json; charset=utf-8')
    },
    setHeader(name, value) {
      headers.set(name, value)
    },
  }

  return {
    response,
    toResponse: () => new Response(body, { status, headers }),
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const incomingUrl = new URL(request.url)
    const routePath = incomingUrl.searchParams.get('_apiPath')
    if (!routePath) {
      return Response.json({ error: 'Not found.' }, { status: 404 })
    }

    let body: unknown
    try {
      body = await getBody(request)
    } catch {
      return Response.json({ error: 'Request body must contain valid JSON.' }, { status: 400 })
    }

    const apiUrl = new URL(`/api/${routePath.replace(/^\/+/, '')}`, request.url)
    for (const [key, value] of incomingUrl.searchParams) {
      if (key !== '_apiPath') apiUrl.searchParams.append(key, value)
    }

    const adapter = createResponseAdapter()
    const headers = Object.fromEntries(request.headers.entries())
    if (!headers.host) headers.host = headers['x-forwarded-host'] ?? incomingUrl.host
    const apiRequest: ApiRequest = {
      method: request.method,
      url: `${apiUrl.pathname}${apiUrl.search}`,
      headers,
      query: getQuery(apiUrl),
      body,
    }

    try {
      await routeApiRequest(apiRequest, adapter.response)
    } catch (error) {
      console.error('[api/router] Request failed.', error instanceof Error ? error.message : 'Unknown error')
      return Response.json({ error: 'The request could not be completed. Please try again.' }, { status: 500 })
    }
    return adapter.toResponse()
  },
}
