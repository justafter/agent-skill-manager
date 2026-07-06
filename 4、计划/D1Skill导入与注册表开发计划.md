# D1 阶段 Skill 导入与注册表开发计划

本计划针对 M1/D1 阶段的“Skill 导入与注册表”工作，目标是实现 `asm import <path>` 核心流程，将符合规范的本地 Skill 导入并注册到 Skill 管理器中。

## 涉及文件

- `src/cli/import.ts` - 命令行选项绑定与输出交互
- `src/core/import.ts` - 共享的核心导入逻辑模块 (新建)
- `library/registry.json` - 技能注册表文件

## 1. 拟实施工作项

### 1.0 导入后的源头约定
- 导入成功后，`library/skills/<skill-name>` 是首版同步到各 Agent 的 canonical source。
- `registry.json` 中的 `localPath` 保留原始导入目录，用于溯源、重新导入、开发目录扫描和后续 Watch Mode；D1/D3a 不直接从 `localPath` 推送到 Agent。
- 后续如果外部 `localPath` 与 `library/skills/<skill-name>` 出现差异，先由 scan/list 标记差异，不自动覆盖任一侧。

### 1.1 核心导入业务逻辑
- 创建 `src/core/import.ts` 并提供 `importSkill` 函数。
- 逻辑步骤：
  1. 调用 `parseSkillDir` 校验 Skill 源目录及 `SKILL.md`。
  2. 使用 `loadConfig` 加载配置，通过 `assertSafeWritePath` 对目标复制路径进行安全检测。
  3. 比对 `library/registry.json` 现有条目，识别冲突：
     - Checksum 相同：直接返回 status = `skipped`。
     - Checksum 不同且无特定选项：抛出 `AppError` 错误提示重名冲突。
     - 提供了 `--force` 选项：先备份旧的 `library/skills/<skill-name>` 和 registry snapshot，再执行覆盖写入。
     - 提供了 `--skip` 选项：跳过写入并返回。
  4. 采用安全复制流程把技能文件复制到 `library/skills/<skill-name>` 下：先复制到临时目录，成功后再替换目标目录；避免源目录删除文件后目标端残留旧文件。
  5. 将技能元数据整合进 `registry.json`，持久化保存。
  6. registry 中记录的 checksum 必须与 `library/skills/<skill-name>` 的最终内容一致，而不是只记录原始 `localPath` 的解析结果。

### 1.2 CLI 命令对接
- 修改 `src/cli/import.ts`，为 `import` 命令绑定 `-f, --force` 和 `-s, --skip` 选项。
- 捕获异常，将结果友好地反馈到终端控制台。

## 2. 验证机制

### 自动化测试
- 新建集成测试 `tests/integration/import.test.ts` 进行场景验证。
- 覆盖 force 导入前备份、skip 不写入、重复导入不改变目标、源目录删除文件后目标无旧文件残留。
- 执行 `pnpm run typecheck`。
- 执行 `pnpm run test`。

### 手动检查
- 运行 `pnpm dev import <path>` 执行手工导入验证。
