import type { Command } from 'commander'

export function registerProjectCommand(program: Command): void {
  const project = program.command('project').description('Manage project workspaces')

  project.command('list').description('List registered projects').action(() => {
    console.log('Project listing is not implemented yet.')
  })

  project.command('add').argument('<name>').argument('<path>').description('Register a project').action((name: string, projectPath: string) => {
    console.log(`Project add is not implemented yet: ${name} ${projectPath}`)
  })
}
