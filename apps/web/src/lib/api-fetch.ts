type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

async function parseJson(res: Response) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function request<T>(method: string, url: string, body?: JsonValue): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? typeof data.error === 'string'
          ? data.error
          : data.error &&
              typeof data.error === 'object' &&
              'message' in data.error &&
              typeof data.error.message === 'string'
            ? data.error.message
            : res.statusText
        : typeof data === 'string'
          ? data
          : res.statusText
    throw new Error(message || 'Request failed')
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: JsonValue) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: JsonValue) => request<T>('PATCH', url, body),
  del: <T = { ok: boolean }>(url: string) => request<T>('DELETE', url),
}