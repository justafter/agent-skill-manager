export interface DiffViewProps {
  diff: string
}

export function DiffView({ diff }: DiffViewProps) {
  return <pre>{diff || 'No diff selected.'}</pre>
}
