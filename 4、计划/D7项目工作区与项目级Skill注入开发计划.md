# D7 项目工作区与项目级 Skill 注入开发计划

本计划针对 M1/D7 阶段的项目工作区与项目级 Skill 注入工作。目标是支持注册本地项目，并向项目的工作区中一键注入/同步本地库中已托管的 Skill，统一维护项目级 Agent 环境。
本阶段已与 D8（规则模板同步）完全拆分，本计划只包含 D7 阶段的全部工作。

## 涉及文件

- `src/types/project.ts` - 项目与配置相关接口定义
- `src/core/config.ts` - 用户级配置保存与合并
- `src/projects/guard.ts` - 安全路径校验
- `src/projects/inject.ts` - 项目级注入计划与物理执行逻辑
- `src/cli/project.ts` - CLI 中的 `asm project` 命令组实现
- `src/server/routes/projects.ts` - 本地 HTTP API 路由
- `web/src/pages/ProjectSpacePage.tsx` - 前端项目空间管理页面；项目卡片支持展开"已安装路径"折叠区（与 D6 §2.8 同源样式：flex 居中、tag 等宽、`flex: 1; min-width: 0`）；"添加项目"对话框使用 `<DirectoryPicker>` 组件

---

## 1. 设计原则

- **用户隔离持久化**：所有注册的项目只写入到用户级配置文件 `%USERPROFILE%/.skill-manager/config.json` 中，绝不改写或提交到公共仓库。
- **路径安全至上**：所有向项目目录写入 Skill 的操作（包括文件和文件夹），必须经过 `assertInsideProject(projectPath, targetPath)` 安全拦截，防止相对路径越权写入。
- **备份与状态追踪**：
  - 在注入或覆写项目下的技能前，自动在备份目录中创建该技能在该项目中的物理备份。
  - 成功注入后，在项目技能目录下生成 `.skill-manager-deploy.json` 作为部署追踪文件。
  - 注入成功后，将部署信息同步更新到本地数据库 `library/registry.json` 中，保存在该技能的 `projectInstalls` 中，以便能够识别哪些项目已同步该技能。

---

## 2. 拟实施工作项

### 2.1 用户配置持久化增强
- 在 `src/core/config.ts` 的 `saveConfig` 方法中完善对 `projects` 数组的局部更新落库。
- 确保 deepMerge 正确处理 `projects` 数组的替换或合并，不造成重复添加。

### 2.2 CLI 命令补齐
在 `src/cli/project.ts` 中实现：
- `asm project list`：列表输出当前配置中所有已注册项目的 `id`、`名称` 和 `物理路径`。
- `asm project add <name> <path>`：
  - 验证物理路径真实存在，若不存在则报错。
  - 自动生成项目的唯一 ID，智能检测项目根目录下的 `.claude`、`.agents` 等目录，自动填充 `enabledAgents`。
  - **Antigravity 探测规则**：Gemini / Antigravity 在项目级**复用** `.agents/`（与 Codex 共享同一目录），探测时 `codex` 与 `gemini` 都使用 `.agents` 探测键；项目注册时**按 agent 名去重**（`Set<AgentId>`），保证每个 agent 至少出现一次、不会因共享目录导致漏探测或多探测。
  - 调用 `saveConfig` 持久化项目配置。
- `asm project scan <project-id>`：重新扫描项目级目录下的技能安装状态，为 Web UI 与状态同步提供基础。
- `asm project inject <project-id> <skill-name> --agent <agent> [--dry-run]`：向项目下的特定 Agent 目录注入指定的 Skill。若指定 `--dry-run` 则只生成并打印 Plan，不进行真实物理操作。

### 2.3 注入与扫描引擎实现
- **注入计划生成**（`src/projects/inject.ts`）：
  - 根据 Canonical Skill（位于 `library/skills/`）的文件列表与物理路径，和项目对应的目标路径（如 `<project>/.claude/skills/<skill-name>`）进行扫描对比。
  - 逐一比对文件 checksum，生成包括 `create`（创建）、`modify`（覆盖更新）、`skip`（一致跳过）等操作 of SyncPlan。
- **注入物理应用**（`src/projects/inject.ts`）：
  - 对非 `skip` 类型的变更项目进行覆盖前备份。
  - 安全拷贝本地技能文件到项目对应路径中，并写入部署追踪 JSON 文件。
  - 最终将安装路径与更新时间更新回本地的 `registry.json` 的 `projectInstalls` 节点下。

### 2.4 后端路由开发
在 `src/server/routes/projects.ts` 扩展以下接口：
- `POST /api/projects`：注册一个新项目（入参为 `name` 和 `path`，运行安全性校验）。
- `GET /api/projects/:id`：返回指定项目的扫描详情（包含已存在的 Skill 目录、支持的 Agent 列表）。
- `POST /api/projects/:id/inject/plan`：获取注入特定技能的计划详情与 Diff 差异。
- `POST /api/projects/:id/inject/apply`：物理应用注入，返回成功状态。

### 2.5 前端 Web UI 项目空间对接
- 对接 `GET /api/projects` 与 `POST /api/projects`，支持列表展示及表单新建项目。
- 重构项目空间页面，设计出富质感的**项目 Skill 注入管理控制台**：
  - 显示项目中当前已激活的 Agent 状态。
  - 能够一键拉起 Skill 注入流程：选择要注入的 Skill 并在弹出 Dialog 中确认 Plan 后执行注入。

---

## 3. 验收口径

### 3.1 自动化测试
- 在 `tests/integration/project.test.ts` 中完成：
  - 项目添加、重复添加拒绝、列表读取。
- 在 `tests/integration/inject.test.ts` 中完成：
  - 成功向测试项目的不同 Agent 目录注入 Skill。
  - 验证越界路径写入被 assertSafeWritePath 和 assertInsideProject 安全拒绝。
  - 验证本地 registry.json 的 `projectInstalls` 正确写入了本次部署记录。

### 3.2 手动检查
- 使用 CLI：运行 `asm project add test-proj D:\Project_by_AI\Skill-mamnager` 并用 `asm project list` 查看，`enabledAgents` 字段反映实际探测结果。
- **探测去重**：在仅含 `.agents/` 的项目上注册，`enabledAgents` 应同时包含 `codex` 与 `gemini`（共享目录但各自独立）；在仅含 `.claude/` 的项目上注册，应只含 `claude`；两者都含时三者齐全。
- **项目级 Skill 目录**：项目级 Skill 注入到 `.claude/skills/<skill-name>` 或 `.agents/skills/<skill-name>`（Gemini/Antigravity 在项目级复用 `.agents/skills`，与 Codex 共用）。
- 运行 `asm project inject` 注入一个技能，查看项目下目录文件确实生成。
- 运行 Web UI，检查项目空间中注册成功，且能够一键注入并得到同步成功的反馈。
- 检查备份目录下确实产生了对应的技能备份文件。
- 项目卡片展开"已安装路径"折叠区，确认 Skill 目录与 Rule 文件路径正确显示。
