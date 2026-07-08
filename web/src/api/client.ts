export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  await throwIfError(response)
  return (await response.json()) as T
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  await throwIfError(response)
  return (await response.json()) as T
}

export async function apiPut<T>(path: string, body?: any): Promise<T> {
  const response = await fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  await throwIfError(response)
  return (await response.json()) as T
}

export async function apiDelete<T>(path: string, body?: any): Promise<T> {
  const response = await fetch(path, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  await throwIfError(response)
  return (await response.json()) as T
}

async function throwIfError(response: Response): Promise<void> {
  if (response.ok) return
  let errMsg = `Request failed: ${response.status}`
  try {
    const errText = await response.text()
    if (errText) {
      try {
        const errJson = JSON.parse(errText)
        if (errJson?.error?.message) {
          errMsg = `[${errJson.error.code}] ${errJson.error.message}`
        } else if (typeof errJson === 'string') {
          errMsg = errJson
        }
      } catch {
        errMsg = errText || errMsg
      }
    }
  } catch {
    // ignore body read errors
  }
  throw new Error(errMsg)
}
