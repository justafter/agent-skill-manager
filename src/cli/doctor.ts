import type { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { pathExists, isWritable } from '../utils/fs.js'

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check local configuration and target paths status')
    .action(async () => {
      try {
        const config = await loadConfig()

        const pathDetails = async (p: string) => {
          if (!p) return { path: p, exists: false, writable: false }
          const exists = await pathExists(p)
          const writable = exists ? await isWritable(p) : false
          return { path: p, exists, writable }
        }

        const targetsInfo: Record<string, any> = {}
        for (const [key, target] of Object.entries(config.targets)) {
          targetsInfo[key] = {
            enabled: target.enabled,
            userSkillPath: await pathDetails(target.userSkillPath),
            projectSkillPath: target.projectSkillPath,
            projectRuleFile: target.projectRuleFile
          }
        }

        const projectsInfo: any[] = []
        for (const project of config.projects) {
          projectsInfo.push({
            id: project.id,
            name: project.name,
            path: await pathDetails(project.path),
            enabledAgents: project.enabledAgents,
            allowProjectSkill: project.allowProjectSkill,
            allowProjectRule: project.allowProjectRule
          })
        }

        const diagnostics = {
          node: process.version,
          config: {
            backupDir: await pathDetails(config.backupDir),
            devDir: await pathDetails(config.devDir),
            ruleTemplateDir: await pathDetails(config.ruleTemplateDir),
            server: config.server
          },
          targets: targetsInfo,
          projects: projectsInfo
        }

        console.log(JSON.stringify(diagnostics, null, 2))
      } catch (error) {
        console.error('Doctor diagnostics failed:', error)
        process.exit(1)
      }
    })
}
