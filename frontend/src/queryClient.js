import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) =>
        ![401, 403, 404].includes(err?.response?.status) && count < 1,
    },
  },
})