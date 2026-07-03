import { createPlan } from '../core/plan.js'

export function planSync(source: string, target: string) {
  return createPlan({
    source,
    items: [{ kind: 'create', target, bytes: 0 }]
  })
}
