import path from 'node:path'
import type { Project } from '../types/project.js'
import type { SkillMeta } from '../types/skill.js'
import { createPlan } from '../core/plan.js'
import { assertInsideProject } from './guard.js'

export async function planProjectSkillInject(project: Project, skill: SkillMeta, projectSkillPath: string) {
  const target = path.join(project.path, projectSkillPath, skill.name)
  await assertInsideProject(project.path, target)

  return createPlan({
    source: skill.localPath,
    items: [{ kind: 'create', target, bytes: 0 }]
  })
}
