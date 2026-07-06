export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    let errJson
    try {
      errJson = JSON.parse(errText)
    } catch {}
    throw new Error(errJson?.error || errText || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}
