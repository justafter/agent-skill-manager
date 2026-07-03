import type { Project } from '../types/project.js'

export function findProject(projects: Project[], projectId: string): Project | undefined {
  return projects.find((project) => project.id === projectId)
}

export function upsertProject(projects: Project[], next: Project): Project[] {
  const existing = projects.filter((project) => project.id !== next.id)
  return [...existing, next]
}
