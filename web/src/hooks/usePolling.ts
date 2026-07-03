import { useApi } from './useApi'

export function usePolling<T>(key: string, path: string, intervalMs = 5000) {
  return useApi<T>(`${key}:${intervalMs}`, path)
}
