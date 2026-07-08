# D7 项目工作区与项目级 Skill 注入开发计划

本计划针对 M1/D7 阶段的项目工作区与项目级 Skill 注入工作。目标是支持注册本地项目，并向项目的工作区中一键注入/同步本地库中已托管的 Skill，统一维护项目级 Agent 环境。
本阶段已与 D8（规则模板同步）完全拆分，本计划只包含 D7 阶段的全部工作。

## 涉及文件

- `src/types/project.ts` - 项目与配置相关接口定义
- `src/core/config.ts` - 用户级配置保存与合并
- `src/projects/guard.ts` - 安全路径校验
- `src/projects/inject.ts` - 项目级注入计划与物理执行逻辑
- `src/projects/remove.ts` - **项目解除注册：影响预览构建、配置备份、移除应用（仅改配置）**
- `src/cli/project.ts` - CLI 中的 `asm project` 命令组实现
- `src/server/routes/projects.ts` - 本地 HTTP API 路由
- `web/src/pages/ProjectSpacePage.tsx` - 前端项目空间管理页面；项目卡片支持展开"已安装路径"折叠区（与 D6 §2.8 同源样式：flex 居中、tag 等宽、`flex: 1; min-width: 0`）；"添加项目"对话框使用 `<DirectoryPicker>` 组件；项目卡片/列表新增"移除项目"按钮 + 影响预览确认弹窗
- `web/src/pages/ProjectWorkspacePage.tsx` - **项目工作区独立详情页（新增，承接 D6 §2.12）**；路由 `/projects/:id`，完全替代 `ProjectSpacePage` 中原"管理工作区"Modal；展示项目基本信息卡 + 项目级 Skill/Rule 状态总览 + 技能注入 + AI 规则同步四块
- `backups/config-snapshots/` - **新增配置快照备份目录**：存放 `remove-project-<id>-<timestamp>.json`，用于回滚解除注册操作

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
- `asm project remove <project-id> [--yes]`：
  - 行为与 `DELETE /api/projects/:id` 对齐：仅修改 `config.json`，不删除任何项目内文件。
  - 默认打印影响预览（`remove-preview` 内容）后等待用户输入 `y/N`；带 `--yes` 跳过交互式确认，**不跳过预览打印**。
  - 移除成功后打印 `已解除注册 <id>，备份已保存至 <backupPath>`。
  - 错误处理：项目 id 不存在 → 退出码非零 + 错误信息；备份或配置写盘失败 → 保留原配置并报错。

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
- `GET /api/projects/:id/remove-preview`：返回解除注册的影响预览：`project`（待移除记录）、`skillInstalls`（该项目当前所有项目级 Skill 安装，每项含 `skill` / `agent` / `absolutePath`）、`ruleFiles`（该项目当前所有已同步规则文件，每项含 `agent` / `file` / `absolutePath`）。**仅查询，不修改任何状态**。
- `DELETE /api/projects/:id`：解除项目注册（仅修改配置，不删除任何文件）。请求体 `{ confirmed: boolean }`，`confirmed !== true` 时返回 400 `CONFIRMATION_REQUIRED`。成功时：
  1. 先将当前 `config.json` 整文件备份到 `backups/config-snapshots/remove-project-<id>-<ISO-timestamp>.json`；
  2. 从 `projects[]` 中移除目标项目，调用 `saveConfig` 落库；
  3. 写盘失败时回滚内存与磁盘配置，报告错误；
  4. 返回 200，body 含新的项目列表与 `backupPath`（供前端展示与回滚入口）。

### 2.5 前端 Web UI 项目空间对接

- 对接 `GET /api/projects` 与 `POST /api/projects`，支持列表展示及表单新建项目。
- 重构项目空间页面，设计出富质感的**项目 Skill 注入管理控制台**：
  - 显示项目中当前已激活的 Agent 状态。
  - 能够一键拉起 Skill 注入流程：选择要注入的 Skill 并在弹出 Dialog 中确认 Plan 后执行注入。
- **项目移除 UI**：
  - 项目卡片/列表新增 `移除项目` 按钮（与现有 `扫描` / `注入` 等操作按钮并排，危险操作使用次要视觉权重）。
  - 点击后调用 `GET /api/projects/:id/remove-preview` 拉取影响数据，弹出 `PlanConfirmDialog` 同款风格的确认弹窗：
    - 标题：`移除项目 <name>`。
    - 顶部展示待移除的注册记录（id / 名称 / 绝对路径）。
    - 中部以两个折叠区分别列出 `项目级 Skill 安装` 与 `项目级规则文件`，每行展示绝对路径与存在状态。
    - 顶部红色提示横幅：「以下文件不会被删除，移除后仅不再受本工具管理」。
    - 底部一个受控的 `我已了解上述文件不会被删除` 复选框，未勾选时 `确认移除` 按钮禁用。
  - 勾选后点击 `确认移除` 调用 `DELETE /api/projects/:id { confirmed: true }`；成功后刷新项目列表并 toast 提示 `已解除注册，备份已保存至 <backupPath>`，失败时回滚 UI 状态并展示错误。

---

## 3. 验收口径

### 2.6 项目移除实现细节

#### 2.6.1 核心模块：`src/projects/remove.ts`

提供两个纯函数 + 一个 IO 函数（**所有写入路径必须经过 `loadConfig` → 修改内存 → `saveConfig` 三步；不允许直接修改 JSON 字符串**）：

```ts
// 仅查询，不修改任何状态。
export interface RemovePreviewSkillInstall {
  skill: string // skill name
  agent: AgentId
  absolutePath: string // 解析后的项目级绝对路径
  exists: boolean // pathExists()
}
export interface RemovePreviewRuleFile {
  agent: AgentId
  file: string // 'CLAUDE.md' / 'AGENTS.md' / 'GEMINI.md'
  absolutePath: string
  exists: boolean
}
export interface RemovePreview {
  project: { id: string; name: string; path: string }
  skillInstalls: RemovePreviewSkillInstall[]
  ruleFiles: RemovePreviewRuleFile[]
}
export async function buildRemovePreview(project: Project): Promise<RemovePreview>

// 应用移除。confirmed 必须为 true，否则直接抛 CONFIRMATION_REQUIRED。
// 流程：先读 user config.json 备份到 backups/config-snapshots/ → saveConfig 写新配置 → 任意写盘失败回滚。
export interface RemoveProjectResult {
  projects: Project[] // 移除后的列表
  backupPath: string // 备份快照路径，供 UI 展示
}
export async function removeProject(projectId: string, confirmed: boolean): Promise<RemoveProjectResult>
```

实现要点：

1. **配置快照备份**：
   - 目录：`backups/config-snapshots/`（位于 `path.dirname(getUserConfigPath())` 的同级目录下；如不存在则 `ensureDir` 创建）。
   - 文件名：`remove-project-<id>-<ISO 8601 timestamp，冒号替换为 '-'.json>`，例：`remove-project-proj_abc12345-2026-07-07T15-30-00-000Z.json`。
   - 内容：**当前 `getUserConfigPath()` 处 `config.json` 的原始字节**，不经 `JSON.parse` 再序列化（保留格式与缩进风格，减少写盘-读盘的格式差异）。
   - 备份失败 → 抛 `CONFIG_SNAPSHOT_FAILED`，**不**进入 `saveConfig`。
2. **`saveConfig` 写盘失败回滚**：
   - 当前 `saveConfig` 抛 `CONFIG_SAVE_FAILED` 后，已修改的项目数组**不会自动落盘**（磁盘仍是原内容），但调用方在调用前可能已基于 removed-after 视图发起后续操作。
   - 处理：在 `removeProject` 内部用局部变量持有 `originalProjects`（从 `loadConfig` 读到的）和 `nextProjects`（移除目标后的），仅在 `saveConfig` 成功 resolve 后才返回 `nextProjects`；失败则 `throw new AppError('CONFIG_SAVE_FAILED', ..., { backupPath, originalProjects })`，UI/CLI 据此可提示"配置未变更，可使用 backupPath 回滚"。
   - **不**尝试重写旧 `projects[]` 字段以「回滚」——`saveConfig` 是单文件原子 rename，失败说明磁盘文件未被修改，无需再写。
3. **路径校验**：必须复用 `assertSafeWritePath` 检查 `backupPath` 与 `getUserConfigPath()`，避免把快照写到项目目录或无关位置。备份目录必须在白名单内（与现有 backup 机制对齐）。
4. **`projectInstalls` 元数据保留**：`library/skills/<skill>.projectInstalls` 中指向被移除项目的条目**不**清理；如果出现"被移除项目的 install 仍记录在 registry 中"的情况，单独在后续 D 阶段做 reconcile，本功能不处理。
5. **`saveConfig({ projects: nextProjects })`**：参考 §2.4 中 `PUT /rules/template` 已有的"整 projects 数组替换"模式调用，zod schema 自动校验通过。
6. **预览数据来源**：
   - `skillInstalls`：扫描 `library/registry.json`，对每个 skill 的 `projectInstalls[]`，过滤 `target`（形如 `<projectId>:<agent>`）的 `=== <projectId>:<agentId>`，并调用 §现有 `targets[agent].projectSkillPath` + `project.path` + `<skillName>` 解析为绝对路径。
   - `ruleFiles`：当前实现里 `registry.json` 没有 rule 安装维度，需遍历 `library/registry.json` 不够；改用扫描策略——对 `project.enabledAgents` 中的每个 agent，根据 `config.targets[agent].projectRuleFile` 解析到该项目的预期路径（`project.path` + 对应文件名），调用 `pathExists` 判定是否存在。这种"按预期路径扫描"的方式与 D8 现有 `scanProject` 一致。
7. **不删项目目录**：移除过程中**禁止**任何 `rm`/`unlink` 操作目标项目目录；记录 "removed" 仅意味着本工具不再管理。

#### 2.6.2 错误码全表

| 场景           | code                     | HTTP status | 触发条件                                            |
| -------------- | ------------------------ | ----------- | --------------------------------------------------- |
| 项目 id 不存在 | `NOT_FOUND`              | 404         | `projects.find(p => p.id === id)` 返回 undefined    |
| 未确认影响     | `CONFIRMATION_REQUIRED`  | 400         | `confirmed !== true`                                |
| 路径校验失败   | `PATH_OUT_OF_BOUNDS`     | 403         | 备份目标路径不在 allowlist（不应发生，作为防御）    |
| 快照备份失败   | `CONFIG_SNAPSHOT_FAILED` | 500         | `ensureDir` / `writeFile` 失败（磁盘满 / 权限）     |
| 配置写盘失败   | `CONFIG_SAVE_FAILED`     | 500         | `saveConfig` 抛错（沿用 `core/config.ts` 已有定义） |
| 缺少 project   | `VALIDATION_ERROR`       | 400         | `projectId` 缺失 / 非字符串                         |
| 内部清理       | `INTERNAL_ERROR`         | 500         | 其余未捕获                                          |

**回滚语义**：

- `CONFIG_SNAPSHOT_FAILED` 抛出后，配置磁盘未变更、内存中调用方持有的 `nextProjects` 已构造但**未返回**，等于等价"无操作"。CLI/UI 提示"无法生成快照备份，已中止移除"。
- `CONFIG_SAVE_FAILED` 抛出后：磁盘未变（`atomicWriteJson` 是 rename，写失败 = 旧文件不变）；调用方接到的 result 含 `originalProjects`（从备份反推，或重新 `loadConfig`）。UI 在错误 toast 中展示 `backupPath`，提示"原配置未被修改，如需回滚可使用上述快照"。

#### 2.6.3 文案与交互边界

**CLI 默认行为（无 `--yes`）**：

```text
=== 项目移除影响预览 [<projectName>] (<projectId>) ===

待移除注册记录:
  ID:   proj_xxxx
  Name: demo-app
  Path: D:\Projects\demo-app

项目级 Skill 安装（不会被删除，仅解除管理）:
  [claude] code-review          D:\Projects\demo-app\.claude\skills\code-review        存在
  [codex]  pr-description-gen   D:\Projects\demo-app\.agents\skills\pr-description-gen  缺失

项目级规则文件（不会被删除，仅解除管理）:
  [claude] CLAUDE.md             D:\Projects\demo-app\CLAUDE.md                       存在
  [codex]  AGENTS.md             D:\Projects\demo-app\AGENTS.md                       缺失

⚠ 以下文件不会被删除，移除后仅不再受本工具管理。
⚠ 移除前将自动备份当前 config.json 到 backups/config-snapshots/。

确认移除? [y/N]:
```

错误情况：

- 项目 id 不存在：`Error: Project not found: <id>` → exit 1。
- 快照备份失败：`Error: Failed to snapshot config.json: <原因>` → exit 1（不修改 config.json）。
- `saveConfig` 失败：`Error: Failed to write new config: <原因>. Original config.json is intact.` → exit 1。

**Web UI 弹窗结构**（与 §现有 `PlanConfirmDialog` 视觉一致）：

- 标题：`移除项目 <projectName>`
- 第一段（红色横幅）：「以下文件不会被删除，移除后仅不再受本工具管理。」
- 第二段（表格）：
  - `项目级 Skill 安装` 表头，列：`Agent / Skill / 绝对路径 / 状态`。
  - `项目级规则文件` 表头，列：`Agent / 文件名 / 绝对路径 / 状态`。
- 底部：受控复选框 `我已了解上述文件不会被删除`，未勾选时禁用 `确认移除`。
- 主操作按钮文案：`确认移除`，loading 态 `正在移除...`。
- 关闭按钮：`取消`。
- 成功后 toast：`已解除注册，配置备份已保存至 <backupPath>`。

- 在 `tests/integration/project.test.ts` 中完成：
  - 项目添加、重复添加拒绝、列表读取。
  - **项目移除**：成功移除后 `config.json` 中 `projects[]` 不再包含该项目；`backups/config-snapshots/` 出现 `remove-project-<id>-<timestamp>.json` 备份且内容与移除前一致；项目目录下的 `.claude/skills/<skill>`、`.agents/skills/<skill>`、`CLAUDE.md`、`AGENTS.md` 等文件**原样保留**。返回值含 `backupPath`，且 `backupPath` 实际指向存在的快照文件。
  - **失败回滚 - 快照备份失败**：mock `writeFile` 抛 `ENOSPC`，验证 `removeProject` 抛 `CONFIG_SNAPSHOT_FAILED` 且磁盘 `config.json` **未被改动**（与读到的内容逐字节相同），`projects[]` 不变。
  - **失败回滚 - saveConfig 失败**：mock `atomicWriteJson` 抛错（可通过临时把 `getUserConfigPath()` 改为只读文件路径实现），验证抛 `CONFIG_SAVE_FAILED` 且 `config.json` 字节不变、备份文件仍存在。
  - **路径校验**：`remove` 必须拒绝 `assertSafeWritePath` 校验失败的备份目标（防御性测试：mock 一个项目路径在校验白名单外的项目并尝试移除，期望 `PATH_OUT_OF_BOUNDS`，虽然正常流程下不会触发）。
  - **未确认拒绝**：`removeProject('id', false)` 抛 `CONFIRMATION_REQUIRED`，磁盘与内存配置均未变动。
  - **id 不存在**：`removeProject('not_existing', true)` 抛 `NOT_FOUND`。
  - **`buildRemovePreview` 与真实移除一致性**：`buildRemovePreview(p)` 输出的 `skillInstalls` 和 `ruleFiles`，与移除后再 `loadConfig` 后再 `buildRemovePreview(p)` 输出应完全一致（因为不修改 projectInstalls）。
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
