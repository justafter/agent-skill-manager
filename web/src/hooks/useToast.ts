export function useToast() {
  return {
    show(message: string) {
      console.info(message)
    },
  }
}
