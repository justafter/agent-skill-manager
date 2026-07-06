# D3b 反向拉取与多端同步开发计划

本计划针对 M1/D3b 阶段的“反向拉取与多端同步”工作，目标是实现从 Agent 端演化后的技能代码反向拉取（Pull）回本地权威库，以及通过本地库中转实现跨 Agent 之间的多向同步。

## 涉及文件

- `src/sync/engine.ts` - 扩展 `planSync` 与 `applySyncPlan` 以支持 `from` 逻辑与本地权威库备份重解析
- `src/cli/sync.ts` - 扩展 `asm sync` 支持 `--from` 参数
- `src/server/routes/sync.ts` - API 接口路由适配 `from` 输入

## 1. 拟实施工作项

### 1.1 核心双向流与多向计划生成
- 在 `src/sync/engine.ts` 中重写 `planSync`：
  - 增加入参 `from?: TargetKey`。
  - 校验 `from` 合法性（禁止 Gemini 且必须已启用且有技能目录）。
  - 若指定了 `from` 且 `targets` 中不含 `local`，自动将 `local` 隐式追加到 targets 列表头部。
  - **差值对比判定**：
    - 若目标为 `local`，将 `from` 端文件与本地权威库 `library/skills/<skill-name>` 比较。
    - 若目标为其他 Agent 目录，且计划包含对本地库的更新，我们将基于 `from` 端文件生成对其他 Agent 的变更项，确保最终所有终端一致。

### 1.2 本地权威库写前备份与更新
- 在 `src/sync/engine.ts` 中重写 `applySyncPlan`：
  - 若计划项目标为 `local`：
    - **写前备份**：若本地技能目录已存在，触发调用 `backupSkillAndRegistry(root, config.backupDir, skillName, 'Reverse pull backup')` 强制备份。
    - **安全复制**：清空删除本地现有技能目录，再从源端拷贝文件。
    - **元数据重解析**：物理文件更新后，使用 `parseSkillDir` 物理扫描重新提取版本号、描述信息。
    - **更新注册表**：用新解析出的技能元信息和新 Checksum 更新回 registry，保存注册表。

### 1.3 命令行接口扩展
- 升级 `src/cli/sync.ts`，为 `sync` 命令加入 `[--from <target-key>]` 选项。
- 保证参数组合有效（不能同时缺省 `--from` 和 `--to`）。
- 服务路由 `src/server/routes/sync.ts` 适配并透传 `from` 字段。

## 2. 验证机制

### 自动化测试
- 新增集成测试 `tests/integration/sync_bidirectional.test.ts` 场景验证：
  - 测试 Claude -> Local 反向单向拉取：验证本地自动备份生成、本地权威代码更新、`registry.json` 中版本与校验和重解析。
  - 测试 Claude -> Codex 跨端同步：验证隐式包含拉取本地与推送 Codex 的两步计划、两端代码一致性及注册表同步更新。
- 执行 `pnpm run typecheck`。
- 执行 `pnpm run test`。

### 手动检查
- 运行 `pnpm dev sync <skill-name> --from claude:user --to local` 验证反向拉取与备份。
- 运行 `pnpm dev sync <skill-name> --from claude:user --to codex:user` 验证跨端中转。
