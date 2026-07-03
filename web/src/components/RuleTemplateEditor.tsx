export interface RuleTemplateEditorProps {
  value: string
  onChange(value: string): void
}

export function RuleTemplateEditor({ value, onChange }: RuleTemplateEditorProps) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={12} />
}
