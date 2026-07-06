export interface DiffViewProps {
  diff: string
}

export function DiffView({ diff }: DiffViewProps) {
  return <pre>{diff || '没有选择差异文件。'}</pre>
}
