import type { Command } from 'commander'
import { loadConfig } from '../core/config.js'
import { loadRegistry } from '../core/registry.js'
import { createAdapters } from '../adapters/registry.js'
import { identifySkillState } from '../adapters/scan.js'
import { scanDevelopmentSkills } from '../core/development-scan.js'
import { resolveCanonicalSkillStates } from '../core/canonical-skill.js'
import { pathExists } from '../utils/fs.js'
import type { TargetKey, AgentId } from '../types/adapter.js'

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Scan local library and targets')
    .action(async () => {
      try {
        const config = await loadConfig()
        const registry = await loadRegistry()
        const adapters = createAdapters(config)
        const skills = Object.values(registry.skills)
        const canonicalSkills = await resolveCanonicalSkillStates(skills)
        const canonicalSkillMap = new Map(canonicalSkills.map((skill) => [skill.name, skill]))

        const enabledAgents = (Object.keys(adapters) as AgentId[]).filter((agent) => config.targets[agent]?.enabled)

        if (enabledAgents.length === 0) {
          console.log('No targets enabled in configuration.')
          return
        }

        const scannedTargets = {} as Record<TargetKey, any>
        const untracked = {} as Record<TargetKey, string[]>
        const detectedTargets = {} as Record<TargetKey, boolean>
        const development = await scanDevelopmentSkills(skills)

        for (const agent of enabledAgents) {
          const adapter = adapters[agent]
          const targetKey: TargetKey = `${agent}:user`
          const userPath = adapter.getTargetPaths().userSkillPath

          const detected = userPath ? await pathExists(userPath) : false
          detectedTargets[targetKey] = detected

          if (detected) {
            const targetSkills = await adapter.scanUserSkills()
            scannedTargets[targetKey] = targetSkills

            // Find untracked
            untracked[targetKey] = Object.keys(targetSkills).filter((name) => !registry.skills[name])
          } else {
            console.log(`[-] 未检测到 ${agent} 用户级 Skill 目录 (路径: ${userPath || '(未配置)'})`)
            scannedTargets[targetKey] = {}
            untracked[targetKey] = []
          }
        }

        console.log(`\n=== Scan Results ===`)
        console.log('='.repeat(80))

        if (skills.length === 0) {
          console.log('No skills registered in the local library.')
        } else {
          for (const skill of skills) {
            console.log(`Skill: ${skill.name} (${skill.version})`)
            const dev = development[skill.name]
            if (dev) {
              const devMessage =
                dev.status === 'identical'
                  ? 'identical'
                  : dev.status === 'changed'
                    ? `changed (checksum: ${dev.checksum?.slice(0, 19)}...)`
                    : dev.status === 'missing'
                      ? 'missing'
                      : `invalid (${dev.error})`
              console.log(`  - development: ${devMessage}`)
            }
            for (const agent of enabledAgents) {
              const targetKey: TargetKey = `${agent}:user`
              if (!detectedTargets[targetKey]) {
                console.log(`  - ${targetKey}: missing (target directory not detected)`)
              } else {
                const targetSkillInfo = scannedTargets[targetKey][skill.name]
                const status = identifySkillState(canonicalSkillMap.get(skill.name), targetSkillInfo)
                const tagInfo = targetSkillInfo?.deployTag
                  ? ` [DeployTag: hash=${targetSkillInfo.deployTag.sourceHash.slice(0, 8)}, date=${targetSkillInfo.deployTag.deployedAt}]`
                  : ''
                console.log(`  - ${targetKey}: ${status}${tagInfo}`)
              }
            }
            console.log('-'.repeat(80))
          }
        }

        // Output Untracked Skills
        let hasUntracked = false
        for (const targetKey of Object.keys(untracked) as TargetKey[]) {
          if (untracked[targetKey].length > 0) {
            if (!hasUntracked) {
              console.log(`\nUntracked Skills on Targets:`)
              console.log('='.repeat(80))
              hasUntracked = true
            }
            console.log(`${targetKey}:`)
            for (const skillName of untracked[targetKey]) {
              const info = scannedTargets[targetKey][skillName]
              console.log(`  - ${skillName} (checksum: ${info.checksum.slice(0, 12)}...)`)
            }
            console.log('-'.repeat(80))
          }
        }
      } catch (error) {
        console.error('Scan failed:', (error as Error).message)
        process.exit(1)
      }
    })
}
