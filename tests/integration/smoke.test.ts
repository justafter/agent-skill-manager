import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadConfig } from '../../src/core/config.js'

describe('project skeleton', () => {
  it('loads the default configuration', async () => {
    const config = await loadConfig()
    assert.equal(config.server.port, 47821)
    assert.equal(config.targets.codex.projectRuleFile, 'AGENTS.md')
  })
})
