export async function readJsonResponse(response: Response, service: string): Promise<unknown> {
  let body: string
  try {
    body = await response.text()
  } catch {
    throw new Error(`${service} response could not be read (${response.status}).`)
  }

  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new Error(`${service} returned a non-JSON response (${response.status}).`)
  }
}
