export interface PlanConfirmDialogProps {
  open: boolean
  planId?: string
}

export function PlanConfirmDialog({ open, planId }: PlanConfirmDialogProps) {
  if (!open) return null
  return (
    <section className="empty-state">
      <strong>Plan</strong>
      <p>{planId ?? 'No plan selected.'}</p>
    </section>
  )
}
