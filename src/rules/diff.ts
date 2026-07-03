import { createTwoFilesPatch } from 'diff'

export function diffText(fromName: string, toName: string, before: string, after: string): string {
  return createTwoFilesPatch(fromName, toName, before, after)
}
