# D3a 阶段本地库推送同步开发计划

本计划针对 M1/D3a 阶段的"本地库推送同步"工作，目标是实现将本地库中已登记的技能目录（canonical source，即 `library/skills/<skill-name>`）推送同步到 Agent 用户级技能目录（Claude / Codex）的核心闭环流程。

## 涉及文件

- `src/sync/deploy-tag.ts` - 新增 `readDeployTag`、`writeDeployTag`（与 D2 共享）
- `src/sync/engine.ts` - 重写 `planSync` & `applySyncPlan`
- `src/sync/backup-user.ts` - 新增 `backupBeforeSync`（覆盖目标端前的备份）
- `src/sync/multidirection.ts` - 复用 D2 的状态归一化 `identifySkillState`
- `src/core/plan.ts` - 增 `markPlanExecuted`，`createPlan` 支持 `executedAt`
- `src/core/apply.ts` - `applyPlan` 改为"标记 executed 而非 deletePlan"
- `src/core/state.ts` - 增 `getPlanStatus` / `markExecuted`，TTL 维持 15 分钟
- `src/projects/guard.ts` - 复用 `assertSafeWritePath`（apply 前必须调用）
- `src/cli/sync.ts` - 改写为 `asm sync <skill-name> --to claude:user,codex:user [--dry-run] [--allow-managed-modify]`
- `src/server/routes/sync.ts` - 接入 plan / apply 新签名

## 1. 拟实施工作项

### 1.1 部署标记读取

- 在 `src/sync/deploy-tag.ts` 中实现：
  - `readDeployTag(targetDir): Promise<DeployTag | undefined>`：读取 `.skill-manager-deploy.json`；
  - `writeDeployTag(targetDir, tag): Promise<void>`：原子写入。
- `DeployTag` 字段与 D1 现有 schema 保持一致：`managedBy / skillName / sourcePath / sourceHash / target / projectId? / deployedAt`。
- 读不到 / JSON 损坏时返回 `undefined`，**不抛错**。

### 1.2 核心同步逻辑与差异判定

- 在 `src/sync/engine.ts` 中重写：
  1. **入参**：`{ skillName, targets: TargetKey[], root?, dryRun?, allowManagedModify? }`。
     - `skillName` 必须在 registry 中存在；
     - canonical source 固定为 `library/skills/<skillName>`，**不允许传入 `from` 覆盖**（D3a 仅推送）；
     - 反向拉取 `--from <target> --to local` **不在 D3a 范围**，留待 D3b/D9；
     - `targets` 只允许 `claude:user`、`codex:user`（Gemini D3a 不写入）。
  2. **plan 阶段**：
     - 对每个 target 调 `scanUserSkills` + `identifySkillState` 得到 `identical | missing | changed | conflict | untracked`；
     - `untracked` 不进 plan.items，仅作为提示；
     - `changed` 当且仅当 `allowManagedModify === true` 时才判 `modify`，否则判 `conflict`；
     - 每个 plan item 必须包含 `targetDir`（绝对路径）与 `targetKey`。
  3. **apply 阶段 `applySyncPlan(planId, options)`**：
     - 校验 planId 仍存在（未过期）；
     - 对每个非 `skip/conflict` 的 targetDir 调 `assertSafeWritePath(targetDir, config)`，违反则抛 `PATH_OUT_OF_BOUNDS`；
     - 对每个 `modify` 目标先调 `backupBeforeSync`（见 1.3）；
     - 清空目标目录旧内容（仅受管目录，**用受管列表比对**，非暴力 rm），复制 source 到 target，写 `writeDeployTag`；
     - 更新 registry 的 `syncedTargets`：把本次 `create/modify` 的 target 加入，已存在的保持去重；`skip` 不变更；`conflict` 不变更且不出现在 `applied` 中；
     - 调 `markPlanExecuted(planId, appliedItems)`，**保留 plan**，**不 deletePlan**。

### 1.3 覆盖前备份机制

- 在 `src/sync/backup-user.ts` 中实现 `backupBeforeSync(root, backupDir, targetAgent, skillName, reason)`：
  - 备份 id：`bk_<timestamp>_<uuid8>`（与 D1 `backupSkillAndRegistry` 一致，便于检索）；
  - 目录结构：
    ```text
    backups/<bkId>/user/<agent>/<skill-name>/<原目录内容>
    backups/<bkId>/registry-snapshot.json
    backups/<bkId>/index.json
    ```
  - `index.json` 中每个 `BackupItem` 必须含 `targetType: 'user' | 'project'`（D3a 只用 `'user'`），`targetAgent`、`targetSkillPath`；
  - 备份写入必须先于物理覆盖，失败时抛 `BACKUP_FAILED` 并阻止后续 apply；
  - 与 D1 既有 `backupSkillAndRegistry` 不冲突，**不要合并**：前者用于覆盖 `library/skills` 时，后者用于覆盖目标端。

### 1.4 Plan 生命周期

- `src/core/state.ts`：
  - TTL 维持 15 分钟；
  - 增 `markExecuted(planId, appliedItems)`：写入 `executedAt` 与 `appliedItems`，plan 仍在内存中；
  - 增 `getPlanStatus(planId)`：返回 `{ status: 'pending' | 'executed' | 'expired', plan, executedAt?, appliedItems? }`。
- `src/core/plan.ts`：
  - `createPlan` 返回的 `Plan` 增加可选 `executedAt?: string` 与 `appliedItems?: PlanItem[]`；
  - 增 `markPlanExecuted(planId, appliedItems)` 工具函数。
- `src/core/apply.ts`：
  - `applyPlan` 改为不 `deletePlan`；
  - 末尾 `markPlanExecuted(planId, applied)` 并返回 `ApplyResult`（不变）。

### 1.5 CLI 与 API

- `src/cli/sync.ts` 新签名：
  ```text
  asm sync <skill-name>
       --to <target-key>[,<target-key>...]   // 必填，逗号分隔
       [--dry-run]                           // 默认 true
       [--allow-managed-modify]              // 仅 changed → modify 时需要
  ```
  - 输出：plan.summary + 每个 plan.item 的 `targetKey / targetDir / sourcePath / status`；
  - apply 输出：`applied` 与 `skipped` 列表 + 新 `syncedTargets`。
- `src/server/routes/sync.ts`：
  - `POST /api/sync/plan` 入参 `{ skillName, targets, allowManagedModify? }`；
  - `POST /api/sync/apply` 入参 `{ planId, allowManagedModify? }`（allowManagedModify 必须与 plan 阶段一致，否则返回 400）。

### 1.6 Path Guard 接入

- `applySyncPlan` 在每个 targetDir 写入前调 `assertSafeWritePath(targetDir, config)`；
- server 入口不再做重复目录白名单校验，避免绕过核心逻辑。

### 1.7 registry 字段更新语义

- `syncedTargets`：
  - 仅 `create / modify` 目标加入；
  - `skip` 不变更；
  - `conflict` 不变更；
  - 写入前去重（保持原顺序）；
  - 若 apply 中途失败，回滚 `syncedTargets`（在 try/catch 中保存 apply 前的快照，失败时回写）。
- `projectInstalls` 在 D3a 不动，留给 D7。

## 2. 验收口径

### 自动化测试

- 新增 `tests/integration/sync.test.ts`，覆盖：
  1. dry-run 不产生任何文件变更（用 mtime + checksum 双向核对）；
  2. hash 相同目标自动 skip，且 `syncedTargets` 不变；
  3. 非本工具管理的不同内容目标默认 conflict，不写入；
  4. 有 deploy tag 且 hash 不同：默认仍 conflict；带 `--allow-managed-modify` 时生成 modify，备份目录有 `user/<agent>/<skill-name>`，target 内有 `.skill-manager-deploy.json`；
  5. apply 失败时 registry `syncedTargets` 保持回滚前的值；
  6. plan 在 apply 后仍可查询，状态 `executed`，`appliedItems` 与实际写入一致；
  7. Gemini target 即使被传入也应被拒绝（返回明确错误，CLI/server 都拒绝）；
- 执行 `pnpm run typecheck`；
- 执行 `pnpm run test`。

### 手动检查

- `pnpm dev sync <skill-name> --to claude:user --dry-run` 查看 plan；
- `pnpm dev sync <skill-name> --to claude:user` 执行物理同步与 deploy 检测；
- `pnpm dev sync <skill-name> --to claude:user --allow-managed-modify` 验证受管目录修改路径；
- 在受管目录手工改动 Skill 内容后再 sync，确认默认 conflict、不写入；
- 在 apply 中途制造一次失败（例如手工锁定目标目录文件），确认 registry 未被脏写。

## 3. 风险与待确认

- **受管目录被人手修改后的冲突策略**：默认 `--allow-managed-modify` 必须显式传；不传时一律 conflict，**不允许静默覆盖**。
- **Plan 持久化**：当前仅内存，重启后 `getPlanStatus` 会返回 `expired`；后续如需审计，需把 plan 也写到 `backups/<planId>/plan.json`。
- **apply 中途失败的回滚粒度**：D3a 按"已备份 → 已写入 → 已写 tag → 已更新 registry"四步处理；任一步失败，registry 必须回滚到 apply 前快照，备份目录保留以便人工恢复。
- **备份目录膨胀**：`backupBeforeSync` 每次 apply 都会生成一份独立备份，D4 阶段再补清理策略；D3a 不引入清理逻辑。
- **Gemini/Antigravity**：D3a 显式不写入；如需在 CLI 中允许 dry-run 看到目标路径，仅用于展示，不允许 apply。
- **多端扫描与 D2 状态机耦合**：`changed` 状态依赖 deploy tag 中的 `managedBy === 'AgentSkillManager'`；若用户在 marker 文件上手工改坏 JSON，`readDeployTag` 返回 `undefined`，该 target 会落入 conflict 而非 changed，符合预期。