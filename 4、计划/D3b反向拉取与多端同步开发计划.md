# D3b 反向拉取与多端同步开发计划

本计划针对 M1/D3b 阶段的"反向拉取与多端同步"工作。目标：

1. **反向拉取（Pull）**：把 Agent 用户级目录中"自我进化"后的 Skill 拉回本地权威库 `library/skills/<skill-name>`，同步覆盖 registry 中 `localPath` 指向的导入目录内容，并重新计算 checksum、写回 registry。
2. **跨端中转（Cross-Agent Sync）**：通过本地权威库中转，把 A Agent 的 Skill 复制到 B Agent，例如 `claude:user → local/localPath → codex:user`。

D3b 不实现自动"最新源判定"（按 `lastModified` 推断）；来源必须由 `--from` 显式指定；自动判定留给 D9 Watch Mode 或后续增强。

## 1. 范围与边界

### 1.1 支持场景

- `asm sync <skill-name> --from claude:user --to local [--dry-run]`
- `asm sync <skill-name> --from codex:user --to local [--dry-run]`
- `asm sync <skill-name> --from claude:user --to codex:user [--dry-run]`（隐含 local 中转）
- API：`POST /api/sync/plan`、`POST /api/sync/apply` 增加 `from?: TargetKey` 字段。

### 1.2 不在 D3b 范围

- 自动按 `lastModified` / `mtime` 选择最新源（D9 / 后续增强）。
- 项目级 `claude:project` 作为 `from`（D7 之前不实现）。
- `gemini` 作为 `from` 或 `to`：D3a 已拒绝 Gemini 写入；D3b 同步拒绝 Gemini 作为来源，避免把未验证的 Antigravity 目录当作 canonical。
- Watch Mode 自动触发反向拉取（D9）。
- 多源冲突自动 merge（D3b 只支持"显式 `--from` 单源"）。

## 2. 涉及文件

- `src/sync/engine.ts` - 扩展 `planSync` 接受 `from`，扩展 `applySyncPlan` 处理反向拉取与跨端中转。
- `src/sync/pull.ts` - 新增 `pullToLocal(sourceDir, targetDir)`，封装"原子替换本地库"。沿用 `core/import.ts:79-92` 的 temp-dir + rename 模式，**禁止直接 `rm` 后 copy**。
- `src/sync/backup-user.ts` - 复用，不改动；反向拉取本地库的备份走 D1 既有的 `backupSkillAndRegistry`。
- `src/sync/backup-local.ts` - 新增 `backupLocalLibraryBeforePull(root, backupDir, skillName, reason)`，本地库覆写前沿用 D1 的 registry + skill 快照格式。反向拉取同时需要对 `localPath` 指向的导入目录做独立备份，归类 `targetType: 'development'`。**不与 `backupBeforeSync`（目标端备份）合并**，与 D3a 文档"不要合并"原则一致。
- `src/core/plan.ts` - `createPlan` 入参允许 `pullSource?: { fromTarget: TargetKey; fromDir: string }`，并在 `Plan` 暴露。
- `src/core/state.ts` - 复用 D3a 的 `markExecuted` / `getPlanStatus`。
- `src/core/registry.ts` - 复用；D3b **不修改** `localPath` 路径值，但会在反向拉取时覆盖该路径指向的目录内容（参见 §3.4）。
- `src/types/plan.ts` - 新增 `pull` PlanItem kind；`PlanItem` 增加可选 `fromTargetKey?: TargetKey`、`fromDir?: string`；`ApplyResult` 增加 `warnings: string[]`。
- `src/types/backup.ts` - `BackupItem.targetType` 扩展为 `'user' | 'project' | 'development'`，并补充 development 备份所需的 `targetAgent: 'development'`、`targetSkillPath: <localPath>` 字段。
- `src/cli/sync.ts` - 增加 `--from` 选项；CLI 校验缺 `--from` 时必须有 `--to`，`--from` 缺 `--to` 默认 `local`。
- `src/server/routes/sync.ts` - `POST /api/sync/plan` 入参增加 `from?: TargetKey`；`POST /api/sync/apply` 只接受 `planId`（不再透传 `from`，避免绕过 plan）。
- `tests/integration/sync_bidirectional.test.ts` - 新增。

## 3. 核心语义

### 3.1 Plan 输入与校验

- 新签名：

  ```ts
  planSync(
    skillName: string,
    targets?: TargetKey[],
    options: { from?: TargetKey; allowManagedModify?: boolean } = {},
    root = process.cwd()
  )
  ```

- 校验规则：
  - `from` 必须是 `claude:user` 或 `codex:user`，否则 `TARGET_REFUSED`。
  - `from` 对应 adapter 必须 `enabled` 且 `userSkillPath` 存在，否则 `AGENT_DISABLED`。
  - `targets` 与 `from` 不能为相同 agent。
  - 若 `from` 存在但 `targets` 未传，默认 `targets = ['local']`。
  - 若 `from` 与 `targets` 都未传，复用 D3a 行为：默认推送到所有启用 agent。
  - Gemini 任何角色均拒绝。

### 3.2 Plan 生成

对每个 target 决定 plan item：

#### `local` target

- 读 `from` 端 `scanUserSkills()`，找到 `<skill-name>`。
- 读本地库 `library/skills/<skill-name>` 现状。
- 计算 `source.checksum = from` 端 checksum，`target.checksum = local` 端 checksum。
- 四态：
  - `from` 端不存在 → `conflict`，reason: `from_missing`。
  - `from.deployTag?.managedBy === 'AgentSkillManager'` → `conflict`，reason: `from_is_managed`（**闭环防护**，避免拉回本工具刚 push 出去的版本）。
  - 两端 checksum 相同 → `skip`。
  - 其余 → `pull`（新 kind），`checksumBefore = local.checksum`、`checksumAfter = from.checksum`、`fromTargetKey = from`、`fromDir = <from userSkillPath>/<skill-name>`。

#### 其他 agent target（仅跨端中转）

- 本地库视为"虚拟源"，不直接读 local，直接用 `from` 端文件作为 source：
  - target 不存在 → `create`
  - hash 相同 → `skip`
  - hash 不同且 `deployTag.managedBy === 'AgentSkillManager'` 且 `allowManagedModify === true` → `modify`，否则 `conflict`

#### 跨端中转的多步策略

- 跨端中转（`from = A:user`，`targets = [B:user]`）必须生成**两步串联计划**，共享同一 `planId`，`Plan.items` 顺序为：
  1. `pull` A:user → local（先备份、再原子替换、再重解析）。
  2. `create/modify/skip` local → B:user（沿用 D3a apply）。

### 3.3 Apply 执行顺序

按 `Plan.items` 顺序处理：

1. **处理 `pull` 项**：
   1.1 调 `assertSafeWritePath(library/skills/<skill-name>, config)`（已在 guard 白名单内，但需显式调用并测试覆盖）。
   1.2 调 `backupLocalLibraryBeforePull`（参见 §3.5）。失败抛 `BACKUP_FAILED`，阻止后续 apply。
   1.3 使用 `pull.ts` 的 **temp-dir + rename 原子替换**（参考 `core/import.ts:79-92`），**禁止直接 `rm` 后 copy**。
   1.4 调 `parseSkillDir` 重新校验新本地库；若 frontmatter 缺失或 `name` 不一致，回滚到备份并抛 `PULL_VALIDATION_FAILED`。
   1.5 用新 metadata 重写 registry.skills[skillName]：`checksum / version / description / hasScripts / hasReferences / hasAssets / lastModified` 全部更新；`localPath` 路径值保持原值；`syncedTargets` 不变（参见 §3.7）。
   1.6 如果 registry 中存在 `localPath` 且它不同于本地库路径，则先备份该导入目录，再把拉回版本覆盖到 `localPath` 指向的目录，最后重新解析校验。

2. **处理 `create/modify`（非 `local` target）**：
   - 完全沿用 D3a 的 backup/copy/tag 流程：`assertSafeWritePath` → `backupBeforeSync`（仅 modify）→ `rm + copyDirectory` → `writeDeployTag`。
   - `syncedTargets` 沿用 D3a："仅 create/modify 加入、skip/conflict 不变更"。

3. **跨端中转的两步回滚**：
   - 任一步失败立即停止后续 step。
   - 在 `try/catch` 中把 `registry` 整体回滚到 apply 前的快照（与 D3a 一致）。
   - 已写入的本地库和导入目录从备份中恢复（仅跨端场景：`pull` 已成功 → 后续失败时，把 local 与 localPath 恢复到 pull 前快照）。
   - 备份目录保留以便人工排查。

### 3.4 `localPath` 字段语义

- 反向拉取**不修改** `registry.skills[skillName].localPath` 的路径值：
  - `localPath` 是用户原始开发目录的引用，路径本身必须保留，避免丢失导入来源。
  - 但 `localPath` 指向的目录内容必须与本地库保持一致；用户选择从 Agent 拉回时，语义是把该 Agent 版本作为新来源版本。

- 如果反向拉取源文件与 `localPath` 当前内容不同：
  - apply 阶段先备份 `localPath` 指向的导入目录，再用拉回版本覆盖该目录。
  - 覆盖完成后重新执行 `parseSkillDir(localPath)` 校验，校验失败则中断并保留备份供恢复。
  - `ApplyResult.warnings` 不再用于提示“localPath 未更新”，只保留真实失败或非阻断风险提醒。

### 3.5 本地库覆写前的备份

- 新增 `src/sync/backup-local.ts` 中的 `backupLocalLibraryBeforePull(root, backupDir, skillName, reason)`：
  - 内部复用 `backupSkillAndRegistry`（D1 既有）的物理备份逻辑，保留 registry 快照与 `library/skills/<skill-name>` 快照，**不要合并函数**。
  - 本地库备份沿用 D1 的索引格式，不额外设置 `targetType`；导入目录备份单独使用 `targetType: 'development'`。
  - 失败抛 `BACKUP_FAILED`，阻止后续 apply。
- 新增导入目录备份调用：
  - 反向拉取覆盖 `localPath` 前创建独立备份索引，`BackupItem.targetType = 'development'`。
  - `BackupItem.originalPath` 与 `targetSkillPath` 均记录 registry 中的 `localPath`，便于用户确认恢复目标。
  - 导入目录备份失败时必须阻止 apply，不能在无备份状态下覆盖用户开发目录。

### 3.6 Plan 生命周期

- 沿用 D3a 的内存态 plan registry（TTL 15 分钟）。
- apply 后 `markPlanExecuted(planId, appliedItems)`，保留 plan。
- 跨端中转的两步共享同一 `planId`，`appliedItems` 记录两次写入的 items。

### 3.7 registry 字段更新语义

| 字段 | 反向拉取后行为 |
| --- | --- |
| `checksum / version / description / hasScripts / hasReferences / hasAssets / lastModified` | 用 `parseSkillDir` 重新解析覆盖 |
| `localPath` | 路径值**不变**；路径指向的目录内容被同步覆盖为拉回版本（参见 §3.4） |
| `syncedTargets` | **不变**（D3b 不重置；后续 D5/D9 评估是否刷新） |
| `projectInstalls` | **不变**（D7 之前不动） |

apply 中途失败 → 整个 `registry` 整体回滚到 apply 前的快照。

### 3.8 Path Guard 接入

- `applySyncPlan` 中所有写路径必须先 `assertSafeWritePath`：
  - 写本地库 `library/skills/<skill-name>` → guard 白名单已包含 `library/skills`。
  - 写导入目录 `localPath` → 必须校验其最终目录名与 `skillName` 一致，且写入前创建 development 备份；该路径是用户显式导入过的路径，不作为普通推送源端。
  - 写目标端 → guard 白名单已包含各 agent `userSkillPath`。
  - 写 `library/registry.json` → guard 白名单已包含 `allowedExactPaths`。
- server 入口**不再做重复白名单校验**（与 D3a 一致）。

## 4. CLI 与 API

### 4.1 CLI

- 新签名：

  ```text
  asm sync <skill-name>
       [--from <target-key>]                       // 可选
       [--to <target-key>[,<target-key>...]]       // 可选
       [--dry-run]                                 // 默认 true（与 D3a 一致）
       [--allow-managed-modify]                    // 跨端 create/modify 时需要
  ```

- 行为：
  - 缺 `--from` 缺 `--to` → D3a 默认行为：自动选择所有启用 agent 作为 targets。
  - 有 `--from` 缺 `--to` → 默认 `--to local`。
  - 有 `--to` 缺 `--from` → D3a 行为（本地库作为 source）。
  - 有 `--from` 有 `--to` → 反向拉取或跨端中转。
  - `--allow-managed-modify` 仅作用于跨端中转第二步，**不**作用于 reverse pull（D3b 拉回本地库不依赖此开关）。

- 输出：plan.summary（含 `pull` 计数）+ 每个 plan item 的 `kind / targetKey / targetDir / fromDir? / checksumBefore? / checksumAfter?`。

### 4.2 Server API

- `POST /api/sync/plan`：
  - 入参 `{ skillName, from?, targets?, allowManagedModify? }`。
  - `from` 与 `targets` 同时给 → 反向拉取或跨端。
  - 返回的 `plan.items` 中如包含 `pull`，UI 应展示 `fromDir` 与本地库路径的 diff 链接。
- `POST /api/sync/apply`：
  - 入参 `{ planId, allowManagedModify? }`（与 D3a 一致，不再透传 `from`，避免绕过 plan）。

## 5. 验收口径

### 5.1 自动化测试

新增 `tests/integration/sync_bidirectional.test.ts`，覆盖：

1. **dry-run 无任何物理变更**：registry checksum 不变、library/skills mtime 不变、目标端 mtime 不变。
2. **`--from claude:user --to local`，hash 不同**：本地库覆写；`localPath` 路径值不变但目录内容被覆盖为拉回版本；deploy tag 不写本地库；registry.checksum 更新。
3. **拉回的源端 `managedBy === 'AgentSkillManager'`**：plan 标 `conflict`，reason: `from_is_managed`，不 apply。
4. **拉回的源端不存在**：plan 标 `conflict`，reason: `from_missing`。
5. **两端 checksum 相同**：plan 标 `skip`，不写本地。
6. **`--from claude:user --to codex:user`，跨端中转**：plan 包含 `pull` + `create` 两步；apply 后本地库、localPath、codex 端都更新；registry.syncedTargets 反映 codex；备份目录至少出现本地库、localPath、codex 端备份。
7. **apply 中途失败回滚**：跨端场景下让 `create` 步骤失败，path guard 拒绝 → 本地库和 localPath 应被恢复到 pull 前快照；registry 应回滚到 apply 前。
8. **Gemini 作为 `from` 被拒绝**：`TARGET_REFUSED`。
9. **CLI 校验**：缺 `--from` 缺 `--to` 不报错（继承 D3a 行为）；`--from` 存在但 `--to` 缺省时默认 `local`。
10. **apply 后 plan 仍可查**：`getPlanStatus` 返回 `executed`，`appliedItems` 与实际写入一致。
11. **`localPath` 路径值不变**：反向拉取后 `registry.skills[skillName].localPath` 等于 apply 前。
12. **`localPath` 内容同步**：反向拉取后 `registry.skills[skillName].localPath/SKILL.md` 与拉回源版本一致，并产生 `targetType: 'development'` 的备份索引。

执行：

- `pnpm run typecheck`
- `pnpm run test`

### 5.2 手动检查

- `pnpm dev sync <skill-name> --from claude:user --to local --dry-run` 查看反向拉取计划。
- 在 Claude 用户级目录手动修改 Skill 模拟"自我进化"，再 `pnpm dev sync <skill-name> --from claude:user --to local` 执行反向拉取与备份。
- `pnpm dev sync <skill-name> --from claude:user --to codex:user --dry-run` 查看跨端中转两步计划，再实跑确认两端一致。
- 在受管反向拉取源端（带 deploy tag）执行 `--from ... --to local` 应被识别为 conflict，不应用。
- 制造 apply 失败（如锁定 codex 目录）确认本地库与 registry 都回滚。

## 6. 风险与待确认

- **闭环防护**：`from.deployTag.managedBy === 'AgentSkillManager'` 时拒绝拉回，plan 标 conflict，避免把本工具刚 push 出去的版本当作自我进化。
- **本地库覆写原子性**：采用 `core/import.ts` 的 temp-dir + rename 模式，**不直接 `rm` + copy**，避免 copy 失败丢数据。
- **`localPath` 覆盖风险**：反向拉取会覆盖导入目录内容，必须先生成 development 备份，并在确认弹窗中让用户明确知道“拉回版本会覆盖导入目录”。
- **`syncedTargets` 失真**：反向拉取后 `syncedTargets` 仍指向历史 push 目标；这些目标上的 Skill 现在是"旧版"，与本地库不一致。D5 增强可加"反向拉取后重新推送所有 syncedTargets"选项；D3b 默认不重推。
- **备份目录膨胀**：D3b 与 D3a 一样每次反向拉取 / 跨端中转都会生成新备份索引，D4 之前无清理策略。
- **plan TTL 窗口**：跨端中转的两步必须在一个 apply 内完成（15 分钟 TTL），否则第二步会因 plan 过期失败。apply 期间不要让用户长时间停在二次确认。
- **`--from` 与 `--allow-managed-modify` 同时存在**：跨端中转时第二步（push 到 B）需要 `--allow-managed-modify`；D3b 沿用 D3a 的"两步都需要显式 allow"语义，CLI 不做隐式联动。
- **CLI 与 D3a 默认 `--dry-run` 一致**：D3b 沿用 D3a 的 `--dry-run` 默认 true；D3b 文档"实跑"示例必须显式注明"已传 `--dry-run=false` 或省略时默认 dry-run 已生效"，避免用户误以为已 apply。
- **gemini**：D3b 同步不读不写 gemini；若用户已在 Antigravity 写入 Skills，需等 Antigravity 验证完成后单独评估是否纳入同步来源。
- **`backupBeforeSync` vs `backupSkillAndRegistry` vs `backupLocalLibraryBeforePull` vs development 备份**：职责清晰——`backupBeforeSync` 仅作用于目标端 user 目录；`backupSkillAndRegistry` 作用于本地库导入；`backupLocalLibraryBeforePull` 作用于反向拉取覆写本地库；development 备份作用于覆写 `localPath` 导入目录。**不要合并**，与 D3a 文档"不要合并"原则一致。
