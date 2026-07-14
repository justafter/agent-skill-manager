# Skill 管理器建设计划

#工具/Skill管理 #AI/Agent

## 基本信息

- 日期：2026-07-03
- 笔记类型：工具建设方案
- 目标：沉淀 Skill 管理器方案，不启动开发
- 建议仓库：`D:\AgentSkillManager`

## 方案摘要

建设一个独立的本地 Skill 管理器，用来统一维护 Agent Skills、项目级 Agent 规则文件，并按需同步给不同 agent 使用。

首版不做远程市场和完整插件生态，只做本地管理能力：

- 已安装技能列表（含各 Agent 用户级 / 项目级绝对路径展示）
- 导入已有 skill
- 同步到目标 agent
- 选择项目注入项目级 Skill
- 选择项目更新 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 等 Agent 规则文件
- 备份与恢复
- 本地更新检查
- dry-run 预览写入结果

## 需求总览与映射

本节集中记录本工具需要覆盖的完整需求，避免需求分散在后文各模块中不易追踪。

| 用户需求                                                 | 计划中的落点                                    | 首版处理方式                                                                               |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 做一个工具、skill 或其他形式，用来把技能同步给所有 agent | 本方案定位为“本地 Skill 管理器”，不是单个 Skill | 以独立本地工具实现，保留 CLI 与 Web UI                                                     |
| 同步给 Claude Code                                       | Claude 适配器、用户级路径、项目级路径           | 支持用户级 `.claude\\skills` 和项目级 `.claude\\skills`                                    |
| 同步给 Codex                                             | Codex 适配器、用户级路径、项目级路径            | 支持用户级 `.agents\\skills` 和项目级 `.agents\\skills`                                    |
| 同步给 Antigravity / Gemini                              | Gemini / Antigravity 适配器                     | 支持 Antigravity 本机插件 skills 目录，加载效果需实机验证                                  |
| 参考截图中的 Skills 管理页面                             | Web UI 页面规划                                 | 实现列表、计数、导入、备份恢复、检查更新、项目空间                                         |
| 可以从已有目录导入 Skill                                 | 导入已有、Skill 解析与校验模块                  | 支持选择本地目录导入                                                                       |
| 可以从 ZIP 安装 Skill                                    | 后续扩展入口                                    | 本次版本不做，后续再考虑                                                                   |
| 可以备份和恢复                                           | 备份恢复模块                                    | 写入前自动备份，支持按备份恢复                                                             |
| 可以检查更新                                             | 多端扫描比对、本地更新检查                      | 首版只做本地 hash / mtime 比对，不联网；由用户点击“检查更新”时触发，不在页面加载时实时扫描 |
| 可以 dry-run 预览                                        | 同步引擎、Diff 与确认窗口                       | 所有写入先生成 plan，再确认执行                                                            |
| 可以选择项目注入 Skill                                   | 项目工作区模块、项目级 Skill 注入               | 支持选项目、选 Skill、选 Agent 后注入项目级目录                                            |
| 可以选择项目更新 `CLAUDE.md`                             | 规则模板同步模块                                | 支持 Claude 项目规则模板完全覆盖推送、拉取                                                 |
| 可以选择项目更新 `AGENTS.md`                             | 规则模板同步模块                                | 支持 Codex / 通用 Agent 项目规则模板完全覆盖推送、拉取                                     |
| 可以选择项目更新其他 Agent 相关规则                      | Agent 规则配置同步、适配器扩展                  | 首版支持 `GEMINI.md`；其他如 `.cursor/rules`、`.windsurfrules` 先扫描展示，后续扩展写入    |
| Agent 自己修改 Skill 或规则后能回收                      | 多 Agent 自我进化与多向同步                     | 支持扫描差异、拉取回本地、项目规则拉取为模板                                               |
| 不要直接开发，只写计划到笔记                             | 后续实施边界                                    | 当前只维护此 Obsidian 笔记，不创建 `D:\\AgentSkillManager`                                 |

### 首版明确包含

- 本地 Skill 管理器方案。
- Claude / Codex / Gemini-Antigravity 三类适配。
- 用户级 Skill 同步。
- 项目级 Skill 注入。
- 项目规则文件管理：`CLAUDE.md`、`AGENTS.md`、`GEMINI.md`。
- UI / CLI / API / 配置 / 备份 / dry-run / diff / 验收标准。
- **项目工作区独立详情页 `/projects/:id`**（2026-07-08 新增）：
  - 项目卡片 `管理工作区` 按钮跳转到独立路由，不再使用 Modal 弹窗。
  - 详情页内容包含项目基本信息卡、项目级 Skill 与 Rule 文件状态总览、技能注入区、AI 规则同步区，以及 `重新扫描` / `返回项目空间` 快捷操作。
  - 项目卡片 `管理工作区` 按钮旁提供帮助图标（`ⓘ`），hover/点击展示工作区能力说明。
  - 实现细节详见 `4、计划/D6WebUI首版闭环开发计划.md` §2.12 / §2.12.1。

### 首版暂缓但保留扩展口

- OpenCode、Hermes 的实际写入适配。
- Cursor、Windsurf 等其他 Agent 规则的自动写入。
- ZIP 安装 Skill。
- 远程技能市场。
- 联网自动更新。
- 多模板复杂合并。

## 首版范围

首版支持目标：

- Claude Code
- Codex
- Gemini / Antigravity

首版支持的写入范围：

- 用户级 Skill 目录
- 项目级 Skill 目录
- 项目根目录 Agent 规则文件

首版暂不支持：

- OpenCode
- Hermes
- 远程发现市场
- 联网自动更新
- 自动修改 agent 主配置文件

## 核心设计

使用 Agent Skills 标准作为统一源格式：

```text
skills/<skill-name>/SKILL.md
```

`SKILL.md` 必须包含：

- `name`
- `description`

可选目录：

- `scripts/`
- `references/`
- `assets/`

工具形态：

- 本地 Web UI
- CLI
- 本地配置文件
- 本地备份目录

## 技术栈确定

本项目确定使用以下技术栈进行开发：

- **开发语言**：TypeScript
- **运行环境**：Node.js
- **命令行工具 (CLI)**：Commander.js
- **本地服务 (Backend)**：Express.js
- **用户界面 (Frontend)**：React + Vite
- **文件监听**：chokidar，用于 Watch Mode 热同步
- **差异对比**：首版使用文本级 diff，后续可引入 Monaco Diff Editor
- **数据存储**：JSON 文件落盘，不引入数据库

### 选用理由

1. **环境一致性**：与 Claude Code、Codex、Gemini / Antigravity 的本地运行和配置目录更容易集成。
2. **轻量与高表现**：前后端分离方案启动简单，能提供清晰的状态展示、差异对比和确认流程。
3. **可维护性**：TypeScript 适合实现文件系统适配器、同步计划、规则模板和前端 UI 之间的共享类型。

## 交付物边界

首版交付物应包含：

- 一个可独立启动的本地管理器仓库。
- 一个 Web UI，用于查看、导入、同步、备份、恢复 Skill。
- 一个 CLI，用于在终端完成同样的核心操作。
- 一个统一 Skill 源目录，用于存放用户维护的标准 Agent Skills。
- 一个规则模板目录，用于维护 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 等项目规则模板。
- 一套项目工作区管理能力，用于选择项目并注入 Skill 或规则文件。
- 一套目标 Agent 适配器，用于写入 Claude、Codex、Gemini / Antigravity 的技能目录。
- 一套备份和恢复机制，确保同步失败时可回滚。

首版不包含：

- 远程市场、远程搜索、远程版本源。
- 多用户权限体系。
- 后台常驻系统托盘。
- 自动修改 agent 主配置文件。
- 对不支持 Agent Skills 标准的工具做深度兼容。

## 建议仓库目录结构

```text
D:\AgentSkillManager
├── package.json
├── tsconfig.json
├── skill-manager.config.json
├── library
│   ├── registry.json
│   ├── skills
│   │   └── <skill-name>
│   │       ├── SKILL.md
│   │       ├── scripts
│   │       ├── references
│   │       └── assets
│   └── rules
│       ├── claude
│       │   └── CLAUDE.md
│       ├── codex
│       │   └── AGENTS.md
│       ├── gemini
│       │   └── GEMINI.md
│       └── common
│           └── AIWorkLog.md
├── backups
├── src
│   ├── cli
│   ├── server
│   ├── core
│   ├── adapters
│   ├── projects
│   ├── rules
│   ├── sync
│   ├── backup
│   └── validation
└── web
    ├── index.html
    └── src
```

目录职责：

- `library/skills`：统一 Skill 源库，只放标准 skill 包。
- `library/rules`：统一规则模板库，按 agent 分类维护项目规则文件模板。
- `library/registry.json`：记录已导入 Skill 的元信息、hash、绑定目标和最近同步状态。
- `src/adapters`：每个 agent 一个适配器，隔离路径识别、安装规则和状态扫描逻辑。
- `src/projects`：负责项目注册、项目扫描、项目级目录识别。
- `src/rules`：负责规则模板解析、项目规则文件 diff、合并和写入。
- `src/sync`：统一同步引擎，处理复制、diff、dry-run、冲突判断。
- `src/backup`：负责备份、恢复和备份索引。
- `web`：本地管理 UI，不直接操作文件，所有写入通过本地 API。

## 数据流与配置设计

本地管理器需要维护以下两份配置文件。

### 1. 全局配置 `config.json`

存储用户环境、自定义 Skill 开发根目录、规则模板目录、注册的项目工作区及同步目标路径：

```json
{
  "backupDir": "D:\\AgentSkillManager\\backups",
  "devDir": "D:\\MySkillDevelopment",
  "ruleTemplateDir": "D:\\AgentSkillManager\\library\\rules",
  "targets": {
    "claude": {
      "enabled": true,
      "userSkillPath": "C:\\Users\\justafter\\.claude\\skills",
      "projectSkillPath": ".claude\\skills",
      "projectRuleFile": "CLAUDE.md"
    },
    "codex": {
      "enabled": true,
      "userSkillPath": "C:\\Users\\justafter\\.agents\\skills",
      "projectSkillPath": ".agents\\skills",
      "projectRuleFile": "AGENTS.md"
    },
    "gemini": {
      "enabled": true,
      "userSkillPath": "C:\\Users\\justafter\\.gemini\\config\\skills",
      "projectSkillPath": ".agents\\skills",
      "projectRuleFile": "GEMINI.md"
    }
  },
  "projects": [
    {
      "id": "obsidian-notes",
      "name": "Obsidian笔记",
      "path": "D:\\Obsidian笔记",
      "enabledAgents": ["claude", "codex"]
    }
  ]
}
```

### 2. 技能注册表 `registry.json`

维护本地导入的所有 Skill 及其状态。其中 `localPath` 支持绑定到任意磁盘路径，即用户的 Skill 开发目录：

```json
{
  "skills": {
    "comfyui-video-gen": {
      "name": "comfyui-video-gen",
      "version": "1.0.0",
      "localPath": "D:\\MySkillDevelopment\\comfyui-video-gen",
      "checksum": "sha256:a1b2c3d4...",
      "syncedTargets": ["claude:user", "codex:user"],
      "projectInstalls": [
        {
          "projectId": "obsidian-notes",
          "target": "claude:project",
          "checksum": "sha256:a1b2c3d4..."
        }
      ]
    }
  }
}
```

#### 本地库、开发目录与目标目录的关系

首版 Skill 同步采用三层路径模型：

1. **开发目录 / 导入目录**：用户实际编辑 Skill 的目录，记录在 `registry.skills[*].localPath` 中，可位于任意磁盘路径。
2. **本地库 / 权威副本**：管理器内部统一维护的 Skill 源库，即 `library/skills/<skill-name>`。同步计划默认以本地库为源端。
3. **目标 Agent 目录**：Claude / Codex / Gemini 等 Agent 实际读取的用户级或项目级 Skill 目录。

默认同步链路为：

```text
开发目录 localPath
  -> 更新本地库 library/skills/<skill-name>
  -> 同步到目标 Agent 目录
```

反向拉取或跨 Agent 同步链路为：

```text
来源 Agent 目录
  -> 覆盖本地库 library/skills/<skill-name>
  -> 覆盖开发目录 localPath
  -> 可选继续同步到目标 Agent 目录
```

说明：

- `localPath` 是用户编辑入口和溯源路径，不直接作为普通推送同步的源端。
- 当“检查更新”发现 `localPath` 与本地库 hash 不一致时，UI 提示“开发目录有变更”，用户需要先点击“更新本地库”，再同步到目标 Agent。
- “更新本地库”本质上等同于对该 `localPath` 执行一次带备份的重新导入，更新 `library/skills/<skill-name>` 和 registry checksum。
- 从 Agent 反向拉取时，管理器会先备份并覆盖本地库，再备份并覆盖 `localPath` 指向的导入目录内容；registry 中的 `localPath` 路径值保持不变。
- 后续 Watch Mode 可在用户显式开启后自动执行“开发目录 -> 本地库 -> 已确认目标”的链路；默认页面列表不做实时扫描。

## 核心模块设计

### 1. Skill 解析与校验模块

职责：

- 读取 `SKILL.md` frontmatter。
- 校验 `name` 是否符合 Agent Skills 命名规则。
- 校验 `description` 是否存在且不为空。
- 计算整个 skill 目录的内容 hash。
- 提取描述摘要、资源目录、脚本目录和最近修改时间。

失败处理：

- 缺少 `SKILL.md`：拒绝导入。
- 缺少 `name` 或 `description`：拒绝导入并给出明确错误。
- `name` 与目录名不一致：标记为警告，首版建议拒绝导入，避免多端识别不一致。

### 2. Agent 适配器模块

每个适配器只暴露统一接口：

```text
detect()
scanUserSkills()
scanProjectSkills(project)
planInstall(skill, scope)
install(skill, scope)
remove(skill, scope)
getRuleFile(project)
planRuleUpdate(project, template)    - **差异比对**：比对当前项目规则文件内容与绑定的模板内容是否一致，给出明确提示（一致 / 有异 / 本地未创建）。
    - **同步操作**：提供独立的“拉取规则 ↓”（从项目整文件覆盖拉回更新本地模板）与“推送模板 ↑”（整文件完全推送覆盖到项目）按钮。由于采用完全覆盖模式，用户无需在同步时进行复杂的局部确认或勾选框确认，一键完成同步。
4. 写入前自动备份项目规则文件。

推荐默认策略：

- 如果项目中不存在目标规则文件：直接新建（在头部状态标记为未创建，可一键推送生成）。
- 如果项目中存在目标规则文件且内容与模板不一致：判定为有变更，支持一键推送完全覆写。
- 如果项目中存在目标规则文件且内容一致：判定为已同步，推送按钮置灰。

### 4. 项目规则模板与相互更新迭代

本系统采用**以模板为中心 (Template-Centric)** 的设计，允许用户针对同一个 Agent 维护多个不同项目类型的自定义规则模板（如 `react-frontend.md`、`python-backend.md`），并支持在模板与多个项目之间进行相互更新和迭代：

#### 4.1 模板存储与项目选择

- **模板文件存储与跨 Agent 共享**：自定义规则文件以 `.md` 结尾，存放在本地模板库对应的 Agent 目录下（例如 `library/rules/claude/react-frontend.md`）。但规则模板文件本质上是全通用的，为了最大化规则的复用能力，系统取消了模板只属于特定 Agent 的限制——支持任意模板文件关联并载入到任意项目的任何 Agent 规则（CLAUDE.md / AGENTS.md / GEMINI.md）同步流程中。后端加载器支持在所有 Agent 子目录下跨目录搜索候选模板，实现模板内容的无缝共享。
- **模板导入**：支持从本地任意外部路径导入 Markdown 文件到本地模板库作为新规则模板，原样复制导入，无局部托管限制。
- **项目绑定（严格显式关联）**：允许在项目配置中为每个启用的一级 Agent 规则文件绑定一个指定的模板文件。项目在导入时默认为 **“未关联”** 状态。只有用户在管理器中显式完成了项目与某个规则模板的绑定，该项目才会纳入规则模板托管范围；未关联的项目将不参与任何规则的差异比对、正向推送或反向拉取操作，从而保护项目自身的独立规则不被意外修改。�。
- 写入 `.skill-manager-deploy.json` 管理标记。

管理标记建议格式：

```json
{
  "managedBy": "AgentSkillManager",
  "skillName": "example-skill",
  "sourcePath": "D:\\AgentSkillManager\\library\\skills\\example-skill",
  "sourceHash": "sha256:...",
  "target": "claude:project",
  "projectId": "obsidian-notes",
  "deployedAt": "2026-07-03T00:00:00+08:00"
}
```

### 5. 规则模板同步模块

支持维护和写入以下规则文件：

- Claude Code：`CLAUDE.md`
- Codex：`AGENTS.md`
- Gemini：`GEMINI.md`
- 其他 Agent：后续通过适配器扩展，如 `OPEN_CODE.md`、`.cursor/rules`、`.windsurfrules`

规则同步策略：

- 采用“全文件完全覆盖（Whole-file Overwrite）”策略，不做任何合并。
- 确认以模板库为权威源，推送时以模板文件全量覆写项目规则文件，拉取时以项目规则文件全量覆写本地模板。
- 同步前必须自动备份。

规则更新模式：

- **推送模板（覆盖写入）**：将模板文件整份内容写入项目的规则文件。
- **拉取为模板（覆盖拉取）**：将项目中的规则文件整份内容反向拉回并更新本地模板。

### 6. 备份恢复模块

备份粒度：

- 默认按单个 skill 或单个规则文件备份。
- 执行批量同步时生成一次批量备份索引。
- 恢复时可以恢复单个目标，也可以恢复某次同步涉及的全部目标。

备份索引建议格式：

```json
{
  "backupId": "20260703-153000",
  "createdAt": "2026-07-03T15:30:00+08:00",
  "reason": "before-project-inject",
  "items": [
    {
      "type": "skill",
      "skillName": "example-skill",
      "target": "claude:project",
      "projectId": "obsidian-notes",
      "originalPath": "D:\\Obsidian笔记\\.claude\\skills\\example-skill",
      "backupPath": "D:\\AgentSkillManager\\backups\\20260703-153000\\obsidian-notes\\claude\\example-skill"
    },
    {
      "type": "rule",
      "target": "codex:project",
      "projectId": "obsidian-notes",
      "originalPath": "D:\\Obsidian笔记\\AGENTS.md",
      "backupPath": "D:\\AgentSkillManager\\backups\\20260703-153000\\obsidian-notes\\AGENTS.md"
    }
  ]
}
```

## 同步策略与冲突处理

- 默认使用完全复制方式同步，不使用符号链接，避免跨分区及软链接权限问题。
- 每次写入前先生成 `dry-run` 结果，向用户展示即将新增、修改或删除的文件列表。
- 写入前自动在 `backupDir` 下备份目标目录或目标文件。
- 目标目录存在同名 Skill 时：
  - hash 相同：跳过
  - hash 不同：生成可确认的覆盖计划，执行前备份目标目录，执行后写入 `.skill-manager-deploy.json` 管理标记
- Web UI 的用户级 Skill 同步默认采用“覆盖式同步”语义：用户点击同步时，目标端同名但内容不同的 Skill 目录应转为“修改”项，而不是要求用户手工修复差异。
- CLI / API 可保留保守模式作为底层能力；未传覆盖授权时可把非托管同名目录标记为冲突，传入覆盖授权后必须能备份并覆盖。
- `--allow-managed-modify` 用于兼容“只覆盖已托管变更目标”的保守语义；Web UI 另提供“允许覆盖目标目录中的同名 Skill（包含非托管冲突，覆盖前会备份）”作为覆盖式同步授权。
- 如果用户关闭覆盖授权且同步计划只有冲突项、没有新增或修改项，应用按钮应明确禁用或提示“无可应用项”，不能让用户误以为点击后会强制覆盖。
- 目标规则文件存在时：
  - 默认展示 diff
  - 用户可选择覆盖、托管块更新、拉取为模板或取消

### 多 Agent 端的“自我进化”与多向同步

由于 AI Agent 在执行任务过程中可能具备自我成长/自我修改特性，例如自动修改其自身插件目录下的 `SKILL.md` 指令、追加 scripts 规则，或修改项目根目录的 `CLAUDE.md` / `AGENTS.md`，导致某一端文件的版本超越了管理器本地版本。为了兼容并管理这一特性，系统做如下设计：

#### 1. 版本与变化识别机制

- **开发目录检查更新**：用户可在全局配置中指定 Skill 开发根目录 `devDir`，也可通过 registry 中每个 Skill 的 `localPath` 记录单独的开发目录。首版默认不在页面加载时实时扫描开发目录；用户点击 `检查更新` 或执行显式扫描命令时，管理器才计算开发目录、本地库和目标端的 hash 差异。
- **项目目录自动扫描**：系统扫描已注册项目，识别项目级 Skill 和项目级规则文件。
- **多端扫描比对**：管理器在检查更新时扫描本地开发目录、本地库、用户级 Agent 目录、项目级 Agent 目录。
- **最新版本源判定**：通过 hash 和最后修改时间 `mtime` 判定当前最新版本源。
- **状态高亮提醒**：若检测到开发目录、本地库、某个 Agent 或项目规则文件存在差异，UI 上对应位置高亮，显示“开发目录有变更”“检测到项目内变更”或“检测到 Agent 自我成长版本”。

#### 2. 多向手动同步机制

当检测到版本差异后，用户可手动点击按钮触发同步，指定同步源和同步目标：

- **更新本地库**：将开发目录 `localPath` 中的最新 Skill 重新导入到 `library/skills/<skill-name>`，并更新 registry checksum。
- **拉取 Skill**：将 Agent 中最新的 Skill 版本同步回本地库，并同步覆盖 `localPath` 指向的导入目录内容；覆盖前分别备份本地库和导入目录，registry 中的 `localPath` 路径值保持不变。
- **推送 Skill**：将本地库 `library/skills/<skill-name>` 覆盖推送到指定 Agent 的用户级目录或项目级目录。
- **跨代理同步**：通过本地库中转，将 A Agent 中的进化版本复制同步到 B Agent 中；中转过程中同样更新本地库和导入目录，保证导入目录不落后于被选定的来源版本。
- **拉取规则**：将项目中的 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 拉取回规则模板库。
- **推送规则**：将规则模板写入指定项目。
- **项目间规则复用**：将 A 项目的成熟规则拉取为模板，再推送给 B 项目。

## 项目级注入与 Agent 规则配置同步

该模块是首版需要新增的重要能力，用于把全局 Skill 和规则模板按项目注入。

### 1. 项目注册

用户可以通过 UI 或 CLI 注册项目：

- 项目名称
- 项目绝对路径
- 启用的 Agent 类型
- 是否允许写入项目级 Skill
- 是否允许写入项目规则文件

注册后，管理器会扫描项目内是否已有以下内容：

- `.claude/skills`
- `.agents/skills`（Antigravity 也复用此目录）
- `CLAUDE.md`
- `AGENTS.md`
- `GEMINI.md`
- `.cursor/rules`
- `.windsurfrules`

其中 `.cursor/rules`、`.windsurfrules` 首版只扫描展示，不默认写入。

### 2. 选择项目注入 Skill

工作流：

1. 用户进入 `项目空间`。
2. 选择一个已注册项目。
3. 选择需要注入的 Skill。
4. 选择目标 Agent，例如 Claude Code 或 Codex。
5. 管理器生成 dry-run，展示即将写入的项目级路径。
6. 用户确认后，管理器备份原路径并复制 Skill。

示例目标路径：

```text
D:\Obsidian笔记\.claude\skills\<skill-name>
D:\Obsidian笔记\.agents\skills\<skill-name>
```

项目级 Skill 注入适用场景：

- 某个 Skill 只对特定项目有效。
- 不希望污染用户级全局 Skill 列表。
- 同一个 Skill 在不同项目中需要不同版本。
- 为新项目快速安装一组常用 Agent 能力。

### 3. 选择项目更新 Agent 规则文件

支持更新的规则文件：

- `CLAUDE.md`：Claude Code 项目记忆文件。
- `AGENTS.md`：Codex / 通用 Agent 项目规则文件。
- `GEMINI.md`：Gemini / Antigravity 相关项目规则文件。
- 其他 Agent 规则文件：后续通过适配器扩展。

工作流与UI呈现：

1. 用户进入项目工作区详情。
2. 页面平铺展示 Claude、Codex、Gemini 的 3 个独立规则同步面板。
3. 每个面板独立提供以下要素：
   - **本地规则文件存在状态**：始终在面板头部直观显示该 Agent 的规则文件在本地项目中是否存在（`● 本地已存在` / `○ 本地未创建`），即便未关联任何模板，此状态也照常工作。
   - **关联规则模板**：直接在面板内通过下拉框关联/修改项目在该 Agent 上所绑定的规则模板，绑定时会立即在后台保存并在前端拉取对应的 Patch Diff。关联模板下拉列表合并展示了模板库中全量去重后的规则模板（即打破 Agent 类型的强绑定限制，支持跨 Agent 目录关联任意规则模板）。
   - **差异预览（Diff）**：如果项目已绑定规则模板，自动从后台获取该 Agent 规则的同步计划并嵌入 Diff 差异渲染。
   - **同步操作**：提供独立的“拉取规则 ↓”（从项目拉回更新本地模板）与“推送模板 ↑”（覆盖或按托管块推送到项目）按钮。
4. 写入前自动备份项目规则文件。

推荐默认策略：

- 如果项目中不存在目标规则文件：直接新建（在头部状态标记为未创建，可一键推送生成）。
- 如果项目中存在目标规则文件且包含托管块：以 `block` 模式同步，只更新托管块。
- 如果项目中存在目标规则文件但没有托管块：标记为 `conflict` 冲突状态，展示 diff，不自动覆盖。必须勾选“允许完全覆写”复选框后，方可推送。

### 4. 项目规则模板与相互更新迭代

本系统采用**以模板为中心 (Template-Centric)** 的设计，允许用户针对同一个 Agent（如 Claude）维护多个不同项目类型的自定义规则模板（如 `react-frontend.md`、`python-backend.md`），并支持在模板与多个项目之间进行相互更新和迭代：

#### 4.1 模板存储与项目选择

- **模板文件存储与跨 Agent 共享**：自定义规则文件以 `.md` 结尾，存放在本地模板库对应的 Agent 目录下（例如 `library/rules/claude/react-frontend.md`）。但规则模板文件本质上是全通用的，为了最大化规则的复用能力，系统取消了模板只属于特定 Agent 的限制——支持任意模板文件关联并载入到任意项目的任何 Agent 规则（CLAUDE.md / AGENTS.md / GEMINI.md）同步流程中。后端加载器支持在所有 Agent 子目录下跨目录搜索候选模板，实现模板内容的无缝共享。
- **模板导入与托管块适配**：支持从本地任意外部路径导入 Markdown 文件到本地模板库作为新规则模板。若源文件不包含管理器托管块标记（如 `<!-- BEGIN AgentSkillManager:claude -->` 等），导入时系统将自动以该托管块标记包裹整份规则内容，保障后续与项目的托管合并能力；如已有该标记则予以原样保留。
- **项目绑定（严格显式关联）**：允许在项目配置中为每个启用的一级 Agent 规则文件绑定一个指定的模板文件。项目在导入时默认为 **“未关联”** 状态。只有用户在管理器中显式完成了项目与某个规则模板的绑定，该项目才会纳入规则模板托管范围；未关联的项目将不参与任何规则的差异比对、正向推送或反向拉取操作，从而保护项目自身的独立规则不被意外修改。

#### 4.2 命名转换机制（Sync Translation）

为了保证终端工具能够识别并加载规则，规则文件在同步到项目时会自动转换为 Agent 规定的标准文件名，在拉取回模板库时也会还原到对应的模板文件名：

- **Claude**：本地模板 `<any_name>.md` $\leftrightarrow$ 项目中生成的实际文件 `<project>/CLAUDE.md`
- **Codex**：本地模板 `<any_name>.md` $\leftrightarrow$ 项目中生成的实际文件 `<project>/AGENTS.md`
- **Gemini**：本地模板 `<any_name>.md` $\leftrightarrow$ 项目中生成的实际文件 `<project>/GEMINI.md`

#### 4.3 相互更新与迭代流程（Mutual Iteration Loop）

规则模板不仅是由上往下分发的，也会随着项目开发而不断演进。系统支持如下闭环流程：

1. **项目规则演进**：在某项目（如项目 A）的开发过程中，AI Agent 在实际使用中改进并优化了项目级规则文件（如项目中的 `CLAUDE.md`）。
2. **反向拉取（进化模板）**：用户在模板库的 Web UI 中对该项目点击“拉取 (Pull)”，把优化后的规则内容拉回并更新到对应的本地模板文件（如 `react-frontend.md`）。
3. **差异广播（更新同步）**：一旦本地模板 `react-frontend.md` 更新后，所有同样关联该模板的其他项目（如项目 B、项目 C）将自动在 UI 上高亮显示差异为“待更新”状态。
4. **正向推送（广播规范）**：用户可点击批量推送，将最新的规范一次性更新到所有关联的项目中，实现所有项目规则的相互同步与迭代。

## 开发者创作与热更新 (Watch Mode)

为了向 Skill 创作者提供无缝的开发体验，管理器需要支持监听模式。

### 1. 创作与自动分发工作流

1. 创作者在本地任意工作目录中创建一个包含 `SKILL.md` 的文件夹。
2. 在 UI 上点击 `导入已有` 选择该文件夹，或在终端运行 `asm import <path>`。
3. 管理器自动解析 frontmatter 并在 `registry.json` 中注册。
4. 勾选需要安装的目标 Agent，管理器自动复制分发到对应 Agent 的插件目录。

### 2. 持续修改与自动热同步

- 文件监控机制基于 chokidar。
- 监听范围包括被导入 Skill 的 `localPath`。
- 监听文件包括 `SKILL.md`、`scripts/`、`references/`、`assets/`。
- Watch Mode 默认关闭，只对用户显式开启的 Skill 生效。
- Watch Mode 首版只自动推送 Skill，不自动推送规则文件。
- 文件修改并同步成功后，UI 显示最后同步时间和 Toast 提示。

## CLI 详细命令设计

管理器应提供直观的 CLI 接口，方便终端用户集成：

- `asm list` - 列出本地管理器中所有已登记的 Skills 及其同步状态。
- `asm scan` - 扫描本地开发目录、注册项目和所有已启用目标 Agent。
- `asm import <path>` - 从本地文件夹导入一个符合标准的 Skill 项目。
- `asm sync [skill-name] [--dry-run] [--from <source>] [--to <targets>]` - 执行同步操作，支持 dry-run 预览。
- `asm watch [skill-name] [--target <name>]` - 启动开发监听模式。
- `asm diff <skill-name> <target>` - 对比本地源文件与目标 Agent 下的文件差异。
- `asm backup <skill-name>` - 手动备份指定 Skill。
- `asm restore <backup-id>` - 从备份恢复指定版本的 Skill。
- `asm project list` - 列出所有注册项目及其 Skill / 规则文件状态。
- `asm project add <name> <path>` - 注册新的本地项目工作区。
- `asm project scan <project-id>` - 扫描指定项目中的项目级 Agent 文件。
- `asm project inject <project-id> <skill-name> --agent <agent>` - 将指定 Skill 注入到特定项目的项目级 Agent 目录。
- `asm project plan-rules <project-id> --agent <agent>` - 生成项目规则文件更新计划。
- `asm project push-rules <project-id> --agent <agent> [--mode block|overwrite]` - 将规则模板写入项目。
- `asm project pull-rules <project-id> --agent <agent> --as <template-name>` - 将项目规则文件拉取为模板。
- `asm project remove <project-id> [--yes]` - 从注册表移除项目（仅解除注册，不删除文件；带影响预览，需显式确认；`--yes` 跳过交互式确认，**不跳过预览打印**）。
- `asm doctor` - 检查 Node 版本、配置文件、目标目录权限和 Agent 路径是否存在。

## 本地 API 设计

本地 Web UI 通过 HTTP API 调用后端，不直接访问文件系统。

建议接口：

- `GET /api/health`：检查服务状态。
- `GET /api/config`：读取当前配置。
- `PUT /api/config`：更新配置。
- `GET /api/skills`：返回 Skill 列表、描述、路径、hash 和各目标状态。
- `POST /api/scan`：触发本地扫描。
- `POST /api/import`：导入本地文件夹。
- `POST /api/sync/plan`：生成 dry-run 同步计划。
- `POST /api/sync/apply`：执行同步计划。
- `GET /api/diff`：返回源端和目标端的文本差异。
- `GET /api/backups`：列出备份。
- `POST /api/backup`：创建备份。
- `POST /api/restore`：执行恢复。
- `POST /api/watch/start`：开启监听。
- `POST /api/watch/stop`：关闭监听。
- `GET /api/projects`：列出注册项目。
- `POST /api/projects`：注册项目。
- `DELETE /api/projects/:id`：解除项目注册（仅修改配置，不删除文件）；请求体可携带 `confirmed: true` 表示已确认影响预览；返回 200 携带新的项目列表与本次移除的备份快照路径。
- `GET /api/projects/:id/remove-preview`：获取解除注册的影响预览（待移除注册记录、当前项目级 Skill 安装列表、当前已同步规则文件列表），供前端弹窗渲染。
- `POST /api/projects/:id/scan`：扫描项目级 Agent 文件。
- `POST /api/projects/:id/inject/plan`：生成项目级 Skill 注入计划。
- `POST /api/projects/:id/inject/apply`：执行项目级 Skill 注入。
- `GET /api/projects/:id/rules`：读取项目规则状态。
- `POST /api/projects/:id/rules/plan`：生成规则文件更新计划。
- `POST /api/projects/:id/rules/apply`：执行规则文件更新。
- `POST /api/projects/:id/rules/pull-template`：把项目规则文件拉取为模板。

写接口要求：

- 所有写入接口默认需要先生成 plan。
- `apply` 请求必须带 `planId`，避免 UI 展示内容和实际执行内容不一致。
- 恢复操作也需要先展示恢复范围。

## 可视化 UI 页面与模块规划

### 1. 顶部全局导航栏

- 页面标题：`Skills 管理`
- 全局操作区：
  - `Skill 列表`（首页）
  - `Rule 模板库`（独立路由 `/rules`，详见 §3e）
  - `项目空间`
  - `备份管理`

> 旧版独立的"导入技能"导航与 `/import` 页面已合并到首页（Skill 列表）顶部的 toolbar，以模态对话框形式提供；详见 §3c。

### 2. 统计与过滤状态栏

- `已安装`
- `Claude`
- `Codex`
- `Gemini / Antigravity`
- `项目级`
- `规则文件`
- `检查更新`

### 3. Skill 列表与卡片设计

每个 Skill 作为一个卡片行，包含：

- Skill 唯一标识名。
- 来源标签，如本地、项目、Agent 端。
- Skill 开发目录路径 `localPath`。
- Skill 描述文本。
- 多 Agent 同步状态图标。
- 项目级安装数量。
- 最新变更来源提示。
- 同步、diff、备份、删除等操作。

**导入目录与已安装路径展示**：

- 描述文本下方常驻一行 "导入目录: `<localPath>`"（monospace，自动换行，hover 显示完整），来源是注册表 `registry.skills[name].localPath`。
- 卡片底部提供"查看已安装路径 ▾"按钮，文本标注已安装条目数；点击展开一个折叠区。
- 折叠区按"`<AGENT> · <user|project>` 标签 + 绝对路径"的行展示。
  - 用户级绝对路径：来自 `adapter.scanUserSkills()` 扫到的 `TargetSkillInfo.localPath`，对应 `<userSkillPath>/<skillName>`。
  - 项目级绝对路径：由 `skill.projectInstalls[i].target` + 该项目的注册 `path` + `targets[agent].projectSkillPath` 拼出，格式 `<projectPath>/<projectSkillPath>/<skillName>`。
- **行内布局**：单条路径行使用 flex 布局 + `align-items: center`，使标签与路径在垂直方向居中对齐；标签 `min-width: 90px`、`text-align: center`，使 `CLAUDE · user` / `CODEX · user` / `GEMINI · user` 等标签等宽整齐排列；路径 `<span>` 设 `flex: 1; min-width: 0`，确保在窄列下仍能 `word-break: break-all` 正常换行，不会撑爆容器或贴边。行间使用 `padding: 4px 0` 留白。
- **容器**：折叠区本身放在 `.skill-left` 内部，外层 `.skill-row` 的 `align-items: center` 只对一级子元素生效，不影响嵌套布局。
- 同样的设计同时用在"项目空间"页的项目卡片上：默认折叠、点击展开项目内 Skill 目录与 Rule 文件的绝对路径列表。

### 3b. 未托管的技能 (Untracked) 展示区

为了方便用户发现并托管已存在于各 Agent 环境中但尚未纳入管理器统一登记的技能，系统设计：

- **未托管技能扫描**：在扫描目标 Agent 用户级目录时，自动提取所有包含 `SKILL.md` 但未在 `registry.json` 中注册的技能文件夹，并解析出它们的名称及绝对路径。
- **UI 界面展示**：在本地权威 Skill 列表下方展示独立的“检测到未托管的技能 (Untracked)”面板，展示其来源目标、技能名称、绝对路径。
- **一键托管导入**：为每一条未托管的技能配置“导入”操作按钮，点击后自动将其绝对路径传入导入 API 完成一键导入并刷新，直接将其收编管理。

### 3c. 首页内"导入技能"入口

首页（Skill 列表）顶部 toolbar 同时承载"扫描目标目录"与"导入技能"两个操作。"导入技能"以**模态对话框**形式提供，不占用首页常驻空间：

- 入口：首页 toolbar 左侧新增 `导入技能` 次按钮（普通样式），点击打开对话框。
- 字段：
  - 源目录路径（绝对路径，必填）。使用通用 `<DirectoryPicker>` 组件，支持三种输入方式（详见 §3d）：
    - 手动键入路径（任意浏览器均可用）。
    - Chromium 系列浏览器走 `window.showDirectoryPicker()`，可直接拿到绝对路径。
    - 其它浏览器走隐藏 `<input type="file" webkitdirectory>`，仅返回目录名，组件提示用户补全为绝对路径。
  - `强制覆写`（覆盖前会创建注册表与本地备份，默认关闭）。
  - `如果校验和一致则跳过`（默认关闭）。
- 行为：点击 `导入 Skill` 后调用 `POST /api/import`，参数 `{ path, force, skip }`。
- 反馈：成功/跳过/失败三类消息以彩色提示框显示在对话框内；成功后自动 `refetch()` Skill 列表，刷新"导入目录"行。
- 取消：右上角 `×` 或底部 `取消` 按钮，关闭对话框并清空当前输入与反馈。
- 该入口取代了旧版 `/import` 独立路由与 `ImportPage.tsx` 页面；导航栏不再保留独立"导入技能"项。

### 3d. 通用目录选择器 `<DirectoryPicker>`

为所有需要"绝对目录路径"的输入框提供一致的三模式选择体验，组件名 `DirectoryPicker`，首版用在两处：

- 首页"导入技能"对话框的源目录路径。
- 项目空间页"添加项目"对话框的项目路径。

设计原则：

- **永远不擅自编造路径**。浏览器安全沙箱下 `<input webkitdirectory>` 拿不到绝对路径；组件只把目录名回填给输入框，并以提示语告知用户补全。
- **能力检测**：组件挂载时探测 `window.showDirectoryPicker` 是否可用；可用则按钮文案不变、能力更优；不可用则 fallback 到 webkit input。
- **状态反馈**：组件内部维护 `idle / picked(native|webkit) / failed` 三种状态，分别用绿色成功提示、红色失败提示呈现。
- **可复用**：组件接受 `value / onChange / placeholder / disabled / hint` 标准 props，可在后续"添加项目""备份恢复"等流程中复用。
- **不入后端**：首版不引入 `/api/browse-dir` 等后端目录浏览接口，所有选取都在前端完成；后续若需要远程浏览（如 SSH/远端机器）再扩展。

### 3e. Rule 模板库（独立路由）

Rule 与 Skill 的展示能力对齐，但 **仅做项目级**（无全局 Rule 安装路径、无用户级 Rule 同步）。

- **模板目录可配置**（仅写入 user config）：不再硬编码 `<workspace>/library/rules`。服务端从 `config.ruleTemplateDir` 读取模板根目录；未配置时返回 `CONFIG_MISSING` 错误。RulesPage 顶部 toolbar 显示当前模板目录，旁有"切换模板目录…"按钮（弹 modal，复用 `<DirectoryPicker>`）；后端 `PUT /api/config/rule-template-dir { path }` 通过 `saveConfig(...)` **仅写入 `~/.skill-manager/config.json`（user config）**，不修改仓库根 `skill-manager.config.json`，避免污染共享仓库。`saveConfig` 后续的 deep merge 会让 user config 覆盖仓库默认。
- 入口：顶部导航 `Rule 模板库` → `/rules`。
- 路由：独立路由 `web/src/pages/RulesPage.tsx`，不复用 `SkillsPage`。
- 数据源：
  - 服务端新增 `GET /api/rules`，返回 `{ rules: [{ agent, name, localPath, installedPaths: [...] }] }`。
  - `localPath` 为本地权威模板绝对路径（`library/rules/<agent>/<file>`）。
  - `installedPaths` 列出**所有**已注册项目对该 Rule 的项目级安装路径：`<project.path>/<fileName>` + 是否存在（由 `scanProject(p).ruleFiles` 判定）；首版对每个 agent 全量列出，不做"agent 必须出现在 `enabledAgents` 才显示"的过滤。
- 卡片元素：
  - 标题 `<fileName>` + `<AGENT>` tag + 已注册项目数。
  - **本地模板路径**（常驻，monospace，自动换行，hover title）：来自 `localPath`。
  - **项目级安装路径折叠区**：每行展示 `<AGENT> · project` tag + `<projectName>` + 绝对路径 + "已存在 / 未创建" 状态；与 §3.8 Skill 卡片同款样式（`min-width: 90px` 等宽、路径 `flex: 1; min-width: 0`）。
- 同步入口：每个项目卡片（折叠区里）独立三按钮：
  - **查看 Diff**：调 `GET /api/rules/diff?projectId=<id>&agent=<agent>`，复用 `planRuleSync`。
  - **拉取 ↓**：调 `POST /api/projects/<id>/rules/sync { agent, mode: 'pull' }`，从项目覆写本地模板；带 `window.confirm` 二次确认。
  - **推送 ↑**：根据 `status` 自适应 `mode`：`conflict → overwrite`，否则 `block`。
- 不引入用户级 Rule 概念；不修改 D8 §2.1–§2.4 的核心 plan/apply/template/loader。
- 涉及文件：
  - 新增 `src/server/routes/rules.ts`（`rulesRouter`），挂到 `app.use('/api/rules', ...)`。
  - 新增 `web/src/pages/RulesPage.tsx`。
  - 修改 `src/server/app.ts`、`web/src/App.tsx`。

#### 3e.1 三个按钮的功能语义（查看 Diff / 拉取 ↓ / 推送 ↑）

三个按钮都围绕**本地权威模板**与**项目级规则文件**之间双向流动。下表中"模板"= `library/rules/<agent>/<file>`，"项目文件" = `<project.path>/<fileName>`（例如 `<project>/CLAUDE.md`）。

| 按钮          | 后端调用                                                     | 模式 (`mode`) | 行为                                                                                                                                                            | 数据流向        | 触发条件 / 限制                                                                                                                                                    |
| ------------- | ------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **查看 Diff** | `GET /api/rules/diff?projectId=<id>&agent=<agent>`           | —             | 读取模板与项目文件，按 `planRuleSync` 生成 Unified Diff；返回 `{ status, currentContent, templateContent, expectedContent, patch }`。**不写任何文件**，纯展示。 | —               | 无副作用，可随时调用                                                                                                                                               |
| **推送 ↑**    | `POST /api/projects/<id>/rules/sync { agent }`               | `push`        | 将模板内容整份完全覆盖写入到项目规则文件中。                                                                                                                    | 模板 → 项目文件 | 同步前自动备份；全文件完全覆盖已有的项目规则内容。                                                                                                                 |
| **拉取 ↓**    | `POST /api/projects/<id>/rules/sync { agent, mode: 'pull' }` | `pull`        | 将项目规则文件整份内容反向拉取覆盖更新本地模板。                                                                                                                | 项目文件 → 模板 | 执行前会备份本地模板；前端用 `window.confirm` 做二次确认进行完全覆盖拉取。                                                                                        |

**`planRuleSync` 返回的 4 种 status 与对应操作**：

| `status`    | 触发条件                                           | 推送按钮行为                                       | 拉取按钮行为                                         |
| ----------- | -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `create`    | 项目文件不存在                                     | 一键推送写入全新文件（模板内容 + 末尾换行）        | 若项目文件不存在直接报错                             |
| `identical` | 项目文件存在，内容与模板**完全一致**               | **推送按钮置灰**（无变更）                         | 可拉取（同内容覆盖模板）                             |
| `changed`   | 项目文件存在，但内容与模板**不一致**               | 可推送覆盖（一键完全覆盖）                         | 可拉取（整文件拉取并覆盖模板）                       |

**安全约束**：

- 任何 `overwrite` / `block` 写入项目文件前，自动在 `backups/<backupId>/project/<file>` 下生成快照（`applyRuleSync` → `backupRuleFile`）。
- `pull` 写入模板前，会先备份模板到 `backups/<backupId>/user/<file>`。
- 项目级写入强制走 `assertInsideProject(project.path, targetPath)` 和 `assertSafeWritePath(targetPath, config)`，拒绝任何越界。
- 同步前 UI 必须展示 `status` 与 Diff 文本，避免盲同步。

**与项目空间"AI 规则同步 (D8)" Tab 的关系**：

- Rule 库的按钮调用的是同一套核心（`planRuleSync` / `applyRuleSync`），仅入口不同。
- 区别在 UI 粒度：项目空间 Tab 聚焦"项目 × 模板"的横向选择；Rule 库聚焦"模板 × 项目"的纵向选择。两个入口**读到的 plan 内容完全一致**，可作为互相校对。

#### 3e.2 项目内跨 Agent 互推

在 §3e.1 的"模板 ↔ 项目"方向之外，再加一条**"项目内文件之间互推"**方向，语义聚焦于**管理员在同一项目内把同一份权威规则铺到三个 Agent 规则文件上**。

- **使用场景**：项目里 `CLAUDE.md` 写得最完整，operator 想把相同内容也放到 `AGENTS.md` 与 `GEMINI.md`；或者反过来，发现 `AGENTS.md` 的某段写法更好，挪到 `CLAUDE.md`。
- **核心函数**：`src/rules/apply.ts` 新增 `crossSyncRule(projectId, sourceAgent, targetAgent)`。
- **API**：`POST /api/projects/:id/rules/cross-sync`，body `{ sourceAgent, targetAgent }`；`sourceAgent === targetAgent` 时返回 400 `VALIDATION_ERROR`。
- **模式**：采用全文件完全覆盖（Whole-file Overwrite）模式，源文件整文件内容完全复制覆盖目标文件。
- **前置条件**：
  - 源文件必须存在；

  - 写入前自动调 `backupRuleFile(...)` 把目标文件备份到 `backups/<id>/project/<file>`；
  - 安全校验 `assertInsideProject(project.path, ...)` 同时保护源文件路径与目标文件路径。
- **UI**：Rule 模板库页底部新增"**项目内跨 Agent 互推**"区块，按已注册项目分组，每个项目一张 `3 × 3` 矩阵表；
  - 行 = 源 Agent；列 = 目标 Agent；对角线禁用；
  - 非对角线每格两个按钮：`block` / `overwrite`；
  - 每次点击都先 `window.confirm` 二次确认，显示源 / 目标 / 模式；
  - 结果在单元格下方用小字提示（绿色成功 / 红色失败）。
- **与已有按钮的正交关系**：
  - §3e.1 的"查看 Diff / 拉取 ↓ / 推送 ↑"走的是模板 ↔ 项目方向；
  - 本节"互推"走的是**项目内文件之间**的方向；
  - 两者调用的是不同的核心函数（`applyRuleSync` vs `crossSyncRule`），互不依赖、互不阻塞。
- **不引入 Watch**：`crossSyncRule` 只在用户主动点击按钮时触发；不监听项目目录变化、不自动 plan、不自动 push。

### 4. 项目工作区管理模块

在导航栏点击 `项目空间` 进入，专门进行项目级隔离管理。

项目工作区列表显示：

- 项目名称
- 绝对路径
- 已启用 Agent 类型
- 已注入 Skill 数量
- 已存在规则文件
- 最近扫描时间

项目详情页提供：

- **Skill 注入控制台**：选择项目、选择 Skill、选择 Agent，生成 dry-run 后注入。
- **Agent 规则模板同步器**：展示项目中的 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 与模板差异。
- **项目规则拉取**：把项目中的成熟规则拉回模板库。
- **项目状态扫描**：重新扫描项目目录。

#### 4.1 项目移除（解除注册）

支持将已注册项目从 `skill-manager.config.json` 的 `projects[]` 列表中移除。**首版仅做解除注册，不级联清理任何文件**；该项目路径下已注入的项目级 Skill 与规则文件**保留原状**。

工作流：

1. 用户在 `项目空间` 列表/详情页点击 `移除项目` 按钮，或执行 `asm project remove <project-id>`。
2. 前端弹窗（CLI 用 `--yes` 跳过交互）展示影响预览：
   - 待移除的注册记录：`{id, name, path}`。
   - 该项目当前所有项目级 Skill 安装列表（来自 `library/skills/<skill>/projectInstalls`，过滤 `target === project.id`）：`{skill, agent, projectSkillPath}` 及其展开后的绝对路径。
   - 该项目当前所有已同步规则文件列表（来自 `library/rules/<agent>/<file>` 的 `installedPaths`，过滤到该项目）。
   - 明确标注「以上 Skill 与规则文件不会被删除，移除后仅不再受本工具管理」。
3. 用户勾选 `我已了解上述文件不会被删除` 后才能点击 `确认移除`。
4. 移除前自动创建一份配置快照备份到 `backups/config-snapshots/remove-project-<id>-<timestamp>.json`，便于回滚。
5. 写入新配置（移除目标项目），刷新内存与磁盘。
6. 移除成功后给出提示：项目路径仍可访问，原 Skill 与规则文件保持原状；如需彻底清理，请手动删除或后续在项目详情页触发新的清理流程。

约束：

- 路径校验：仍按 §实现约束校验真实路径必须落在注册项目内部（即只能移除当前已注册的项目，不能传未注册路径）。
- 不删除任何文件：包括项目目录下的 `.claude/skills/<skill>`、`.agents/skills/<skill>`、`CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 等。
- 不清理本地库元数据：`library/skills/<skill>/projectInstalls` 中指向被移除项目的条目**保留**（含其绝对路径记录），仅在该项目被重新注册后才会再次在 UI 出现，便于历史回溯。后续若需要『清理失效项目引用』，通过独立的 scan/reconcile 任务处理。
- 并发与回滚：移除操作是配置层面的事务；如写入失败则回滚到原配置并报错，不留半状态。
- 影响范围控制：移除项目不会级联触发该项目内 Skill 的 uninstall、不会触发规则模板的回写、不会影响其它已注册项目。

错误场景：

- 项目 id 不存在 → 提示 `项目不存在`，不修改配置。
- 路径校验失败 → 拒绝执行并提示。
- 备份或配置写入失败 → 保留原配置并报告错误。

#### 4.2 与其它模块的关系

- 与 §2 Skill 注入：`remove` 只解除注册，不影响已注入的文件；如需重新注入，重新 `add` 同路径即可。
- 与 §3 规则模板同步：`remove` 不修改模板库；项目级规则文件维持当前内容。
- 与 §D4 备份恢复：`remove` 自动产生一份配置快照备份，可通过恢复流程回滚该次移除操作。
- 与 §5 Diff 与确认窗口：`remove` 走的是配置影响预览窗口（不展示文件 diff），与写入操作的 diff 窗口解耦。

### 5. Diff 与确认窗口

所有会写入项目或 Agent 目录的操作都进入确认窗口：

- 展示写入来源。
- 展示写入目标。
- 展示新增、修改、删除文件列表。
- 对文本文件展示 diff。
- 展示备份位置。
- 用户确认后才执行。

## 目标路径

Claude 用户级：

```text
%USERPROFILE%\.claude\skills\<skill-name>
```

Claude 项目级：

```text
<project>\.claude\skills\<skill-name>
```

Claude 项目规则文件：

```text
<project>\CLAUDE.md
```

Codex 用户级：

```text
%USERPROFILE%\.agents\skills\<skill-name>
```

Codex 项目级：

```text
<project>\.agents\skills\<skill-name>
```

Codex 项目规则文件：

```text
<project>\AGENTS.md
```

Gemini / Antigravity 用户级：

```text
%USERPROFILE%\.gemini\config\skills\<skill-name>
```

Gemini 项目级（与 Codex 共享 `.agents/skills`）：

```text
<project>\.agents\skills\<skill-name>
```

Gemini 项目规则文件：

```text
<project>\GEMINI.md
```

## 验证计划

- 使用临时目录验证扫描、导入、同步、备份、恢复。
- 校验 `SKILL.md` frontmatter 格式与必填字段。
- 校验同名冲突处理与提示机制。
- 校验 dry-run 不产生任何文件写入或修改。
- 校验项目注册必须限制在合法绝对路径。
- 校验项目级 Skill 注入不能写出项目目录。
- 校验项目规则文件更新前会生成 diff 和备份。
- 校验托管块更新不会删除项目规则文件中的非托管内容。
- 手动验证 Claude、Codex、Antigravity 是否能识别同步后的测试 Skill。
- 手动验证 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 写入后的项目级读取效果。

## 分阶段里程碑

### M0：方案冻结

- 确认仓库位置。
- 确认首版只做本地管理。
- 确认首版支持 Claude、Codex、Gemini / Antigravity。
- 确认首版加入项目级 Skill 注入和项目规则文件更新。
- 确认配置文件和目录结构。

### M1：CLI 与核心能力

- 完成 `scan`、`import`、`list`、`sync --dry-run`。
- 完成 Skill 校验和 hash 计算。
- 完成 Claude、Codex 用户级路径扫描。
- 完成临时目录测试。

### M2：备份与安全同步

- 完成备份索引。
- 完成同步前备份。
- 完成冲突检测。
- 完成 `.skill-manager-deploy.json` 管理标记。
- 完成恢复命令。

### M3：项目工作区与规则文件

- 完成项目注册、项目扫描、项目状态展示。
- 完成项目级 Skill 注入 dry-run。
- 完成项目级 Skill 注入 apply。
- 完成 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 模板管理。
- 完成规则文件 diff、备份、写入和拉取。

### M4：本地 Web UI

- 完成列表页、状态徽标、目标图标状态。
- 完成项目空间页面。
- 完成导入已有入口。
- 完成 dry-run 预览窗口。
- 完成备份恢复页面。

### M5：Antigravity 与 Watch Mode

- 完成 Antigravity 用户级写入（按官方约定 `~/.gemini/config/skills/<skill-name>`）。
- **首版不再自动生成 `plugin.json`**（已与官方约定对齐，旧插件路径 `~/.gemini/antigravity-ide/plugins/...` 已废弃）。
- 验证 Antigravity 加载状态；UI 显示三态（已写入 / 加载未验证 / 未配置）。
- 完成 Skill Watch Mode + Rule 跨 Agent 变化检测；详见 `4、计划/D9监听与Antigravity验证开发计划.md`。

## 首版验收标准

- 能导入一个标准 `SKILL.md` 目录，并在 UI 和 CLI 中展示。
- 能扫描 Claude、Codex、Antigravity 三类目标的安装状态。
- 能把同一个 Skill 同步到 Claude 和 Codex 的用户级目录。
- 能注册一个项目，并扫描该项目中的 Agent 相关文件。
- 能选择项目，把指定 Skill 注入到项目级 `.claude/skills` 或 `.agents/skills`。
- 能选择项目，生成 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 更新计划。
- 能以覆写模式更新已有规则文件。
- 能把项目中的规则文件拉取回模板库。
- Antigravity 如果加载成功，则同步到其插件 skills 目录；如果加载失败，必须在 UI 中明确显示为“路径已写入但加载未验证”。
- dry-run 模式下不产生任何文件变更。
- 每次覆盖写入前都能生成备份。
- 目标端出现非本工具管理的同名 Skill 时不覆盖，并提示冲突。
- 项目规则文件存在且内容不一致时，支持一键推送完全覆盖。
- 能从备份恢复一次同步前状态。
- UI 中能清楚看到每个 Skill 在每个 agent 和每个项目下的状态。
- CLI 和 UI 对同一份 `registry.json` 与 `config.json` 的读写结果一致。

## 风险与待确认问题

- Antigravity 的自定义插件目录是否会自动加载仍需实机验证。
- Codex 当前更推荐 `%USERPROFILE%\.agents\skills`，但本机也存在 `%USERPROFILE%\.codex\skills`，后者首版只扫描不默认写入。
- 项目级 Skill 注入可能与用户手写项目配置冲突，必须默认 dry-run。
- 规则文件更新前必须自动备份。
- Watch Mode 自动覆盖风险较高，首版必须默认关闭，只对用户显式开启的 Skill 生效。
- 多向同步中仅凭 `mtime` 判断最新版本可能受复制时间影响，后续可增加变更来源标记或提交记录。
- 备份目录可能快速膨胀，需要提供最大保留数量或清理策略。
- 如果多个 agent 同时修改同一个 Skill，首版只标记冲突，不自动合并。
- 如果多个项目的规则文件都被拉取为模板，需要提供模板命名和覆盖确认策略。

## 默认假设

- 首版只服务个人本机使用，不考虑多用户并发修改冲突。
- 优先稳定同步，不追求远程市场能力。
- 项目级规则文件直接进行覆写更新。
- Antigravity 适配基于当前本机目录结构。
- 如果 Antigravity 实际加载失败，首版保留扫描和备份能力，写入目标先限制为 Claude / Codex。

## 后续实施边界

- 本笔记只记录计划，不代表已经创建 `D:\AgentSkillManager`。
- 后续开始开发前，应先确认仓库位置、技术栈、项目级写入策略和首版验收标准。
- 若首版只服务本机，不需要先做安装包或远程发布机制。

## D11 会话记录迁移与管理（2026-07-13 新增）

实现状态：核心功能与自动化验证已完成，待用户配置真实归档目录后进行三个 Agent 的关闭态迁移、还原和重新打开验收。

在 Skill、Rule、项目工作区和备份能力之外，新增独立的会话管理模块，用于将 Claude Code、Codex、Gemini / Antigravity 的历史会话安全迁移到外部归档目录，并按需还原到原 Agent 目录。

确认范围：

- Claude 按 `~/.claude/projects` 下的 session JSONL 与同 UUID 配套目录迁移，不清空 `history.jsonl`。
- Codex 按 `sessions` / `archived_sessions` 下的 rollout JSONL 迁移，不修改索引和 SQLite。
- Gemini 按 `brain/<uuid>` 整目录迁移，非 UUID 目录不纳入。
- 所有操作必须走 plan/apply、路径保护、活动状态检查、checksum 校验和可恢复操作日志。
- 跨盘“移动”实现为 copy → verify → commit → delete，归档校验成功前禁止删除源。
- 首次运行默认使用 `D:\AgentSessionArchive` 作为统一归档目录；用户通过 UI / CLI 保存的绝对路径继续优先于默认值。
- 首版还原目标存在时直接拒绝，不合并、不覆盖。
- 展示层参考 cc-switch 的“紧凑列表 + 列表/分类切换 + 当前会话详情”信息层级：分类视图按 Agent → 项目目录折叠，点击会话可按需查看真实 transcript；保留本项目 Agent 目录/归档目录双侧模型，不引入永久删除或终端恢复能力。

详细设计和任务拆分见：

- `3、详细设计/会话记录迁移与恢复.md`
- `4、计划/D11会话记录迁移与恢复开发计划.md`
