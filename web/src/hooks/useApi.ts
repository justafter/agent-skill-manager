import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../api/client'

export function useApi<T>(key: string, path: string) {
  return useQuery({
    queryKey: [key, path],
    queryFn: () => apiGet<T>(path)
  })
}
