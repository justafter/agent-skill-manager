import path from 'node:path'

export function resolveWorkspacePath(root: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(root, value)
}

export function normalizePath(value: string): string {
  return path.normalize(value)
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
