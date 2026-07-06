import os from 'node:os'
import path from 'node:path'

export function expandUserProfile(value: string): string {
  if (!value) return value
  const home = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir()
  let expanded = value.replace(/%USERPROFILE%/g, home)
  if (expanded.startsWith('~')) {
    expanded = path.join(home, expanded.slice(1))
  }
  return path.normalize(expanded)
}

export function resolveWorkspacePath(root: string, value: string): string {
  const expanded = expandUserProfile(value)
  return path.isAbsolute(expanded) ? expanded : path.resolve(root, expanded)
}

export function normalizePath(value: string): string {
  return path.normalize(value)
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
