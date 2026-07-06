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

- 已安装技能列表
- 导入已有 skill
- 同步到目标 agent
- 选择项目注入项目级 Skill
- 选择项目更新 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 等 Agent 规则文件
- 备份与恢复
- 本地更新检查
- dry-run 预览写入结果

## 需求总览与映射

本节集中记录本工具需要覆盖的完整需求，避免需求分散在后文各模块中不易追踪。

| 用户需求 | 计划中的落点 | 首版处理方式 |
| --- | --- | --- |
| 做一个工具、skill 或其他形式，用来把技能同步给所有 agent | 本方案定位为“本地 Skill 管理器”，不是单个 Skill | 以独立本地工具实现，保留 CLI 与 Web UI |
| 同步给 Claude Code | Claude 适配器、用户级路径、项目级路径 | 支持用户级 `.claude\\skills` 和项目级 `.claude\\skills` |
| 同步给 Codex | Codex 适配器、用户级路径、项目级路径 | 支持用户级 `.agents\\skills` 和项目级 `.agents\\skills` |
| 同步给 Antigravity / Gemini | Gemini / Antigravity 适配器 | 支持 Antigravity 本机插件 skills 目录，加载效果需实机验证 |
| 参考截图中的 Skills 管理页面 | Web UI 页面规划 | 实现列表、计数、导入、备份恢复、检查更新、项目空间 |
| 可以从已有目录导入 Skill | 导入已有、Skill 解析与校验模块 | 支持选择本地目录导入 |
| 可以从 ZIP 安装 Skill | 后续扩展入口 | 本次版本不做，后续再考虑 |
| 可以备份和恢复 | 备份恢复模块 | 写入前自动备份，支持按备份恢复 |
| 可以检查更新 | 多端扫描比对、本地更新检查 | 首版只做本地 hash / mtime 比对，不联网 |
| 可以 dry-run 预览 | 同步引擎、Diff 与确认窗口 | 所有写入先生成 plan，再确认执行 |
| 可以选择项目注入 Skill | 项目工作区模块、项目级 Skill 注入 | 支持选项目、选 Skill、选 Agent 后注入项目级目录 |
| 可以选择项目更新 `CLAUDE.md` | 规则模板同步模块 | 支持 Claude 项目规则模板写入、diff、托管块更新、拉取 |
| 可以选择项目更新 `AGENTS.md` | 规则模板同步模块 | 支持 Codex / 通用 Agent 项目规则模板写入、diff、托管块更新、拉取 |
| 可以选择项目更新其他 Agent 相关规则 | Agent 规则配置同步、适配器扩展 | 首版支持 `GEMINI.md`；其他如 `.cursor/rules`、`.windsurfrules` 先扫描展示，后续扩展写入 |
| Agent 自己修改 Skill 或规则后能回收 | 多 Agent 自我进化与多向同步 | 支持扫描差异、拉取回本地、项目规则拉取为模板 |
| 不要直接开发，只写计划到笔记 | 后续实施边界 | 当前只维护此 Obsidian 笔记，不创建 `D:\\AgentSkillManager` |

### 首版明确包含

- 本地 Skill 管理器方案。
- Claude / Codex / Gemini-Antigravity 三类适配。
- 用户级 Skill 同步。
- 项目级 Skill 注入。
- 项目规则文件管理：`CLAUDE.md`、`AGENTS.md`、`GEMINI.md`。
- UI / CLI / API / 配置 / 备份 / dry-run / diff / 验收标准。

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
      "userSkillPath": "C:\\Users\\justafter\\.gemini\\antigravity-ide\\plugins\\justafter-skill-manager\\skills",
      "projectSkillPath": ".gemini\\skills",
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
planRuleUpdate(project, template)
applyRuleUpdate(project, template)
```

适配器不直接决定冲突策略，只负责把目标端的实际文件状态读出来。冲突判断统一交给同步引擎或规则同步模块。

### 3. 项目工作区模块

职责：

- 注册项目：记录项目名称、绝对路径、启用的 agent 类型。
- 扫描项目：识别项目中已存在的 `.claude/skills`、`.agents/skills`、`CLAUDE.md`、`AGENTS.md`、`GEMINI.md` 等文件。
- 选择项目：UI 和 CLI 均可基于项目 id 操作。
- 项目级注入：把某个 Skill 写入指定项目的 agent 目录。
- 项目规则同步：把规则模板写入项目根目录，或把项目中的规则文件拉回模板库。

项目级写入必须受以下约束：

- 只允许写入已注册项目路径内部。
- 所有写入先生成 dry-run。
- 写入前自动备份项目中的原始文件或目录。
- 如果项目中已有同名 Skill 或规则文件，必须展示 diff。

### 4. 同步引擎

同步引擎负责：

- 生成 dry-run 操作计划。
- 比对源目录和目标目录 hash。
- 判断新增、覆盖、跳过、冲突。
- 触发备份。
- 执行复制。
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

- 首版采用“整文件模板 + diff 确认”策略，不做复杂 AST 合并。
- 对已有规则文件默认不直接覆盖，必须先展示 diff。
- 可选“托管块”模式：只更新管理器维护的标记区块，保留项目自己的其他内容。

托管块格式建议：

```md
<!-- BEGIN AgentSkillManager:codex -->
这里是由 Skill 管理器维护的 Codex 项目规则片段。
<!-- END AgentSkillManager:codex -->
```

规则更新模式：

- **覆盖写入**：适合新项目或用户确认完全使用模板。
- **托管块更新**：适合已有项目，仅更新标记块内容。
- **拉取为模板**：将项目中的规则文件保存为新的模板或覆盖现有模板。

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
  - hash 不同且非本工具管理：标记冲突，不覆盖
  - hash 不同但有管理标记：展示 diff，允许备份后覆盖
- 目标规则文件存在时：
  - 默认展示 diff
  - 用户可选择覆盖、托管块更新、拉取为模板或取消

### 多 Agent 端的“自我进化”与多向同步

由于 AI Agent 在执行任务过程中可能具备自我成长/自我修改特性，例如自动修改其自身插件目录下的 `SKILL.md` 指令、追加 scripts 规则，或修改项目根目录的 `CLAUDE.md` / `AGENTS.md`，导致某一端文件的版本超越了管理器本地版本。为了兼容并管理这一特性，系统做如下设计：

#### 1. 版本与变化识别机制

- **开发目录自动扫描**：用户可在全局配置中指定 Skill 开发根目录 `devDir`。系统启动、用户点击 `检查更新` 或执行后台扫描时，管理器会自动扫描 `devDir` 下所有包含 `SKILL.md` 的子文件夹。
- **项目目录自动扫描**：系统扫描已注册项目，识别项目级 Skill 和项目级规则文件。
- **多端扫描比对**：管理器同时扫描本地开发目录、用户级 Agent 目录、项目级 Agent 目录。
- **最新版本源判定**：通过 hash 和最后修改时间 `mtime` 判定当前最新版本源。
- **状态高亮提醒**：若检测到某个 Agent 或项目规则文件比本地模板更新，UI 上对应图标高亮，显示“检测到项目内变更”或“检测到 Agent 自我成长版本”。

#### 2. 多向手动同步机制

当检测到版本差异后，用户可手动点击按钮触发同步，指定同步源和同步目标：

- **拉取 Skill**：将 Agent 中最新的 Skill 版本同步回本地 Skill 开发目录。
- **推送 Skill**：将本地 Skill 开发目录覆盖推送到指定 Agent 的用户级目录或项目级目录。
- **跨代理同步**：直接将 A Agent 中的进化版本复制同步到 B Agent 中。
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
- `.agents/skills`
- `.gemini/skills`
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

工作流：

1. 用户选择一个项目。
2. 用户选择 Agent 类型。
3. 管理器读取对应规则模板。
4. 管理器读取项目中已有规则文件。
5. 展示 diff。
6. 用户选择更新方式：
   - 新建规则文件
   - 覆盖规则文件
   - 只更新托管块
   - 从项目拉取为模板
   - 取消
7. 写入前自动备份。
8. 写入后更新项目状态。

推荐默认策略：

- 如果项目中不存在目标规则文件：直接新建。
- 如果项目中存在目标规则文件且包含托管块：只更新托管块。
- 如果项目中存在目标规则文件但没有托管块：展示 diff，不自动覆盖。

### 4. 项目规则模板

模板可分为三类：

- **通用模板**：所有项目通用的 Agent 工作规则。
- **Agent 专用模板**：如 Claude、Codex、Gemini 各自的项目入口文件。
- **项目类型模板**：如 Android、Harmony、Obsidian、前端、后端、脚本工具。

后续可支持选择模板组合：

```text
通用规则 + Codex 模板 + Android 项目模板
```

首版可先只支持单模板写入，避免合并规则过早复杂化。

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
  - `项目空间`
  - `从备份中恢复`
  - `导入已有`
  - `发现技能`，首版仅作为占位

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

### 3b. 未托管的技能 (Untracked) 展示区

为了方便用户发现并托管已存在于各 Agent 环境中但尚未纳入管理器统一登记的技能，系统设计：

- **未托管技能扫描**：在扫描目标 Agent 用户级目录时，自动提取所有包含 `SKILL.md` 但未在 `registry.json` 中注册的技能文件夹，并解析出它们的名称及绝对路径。
- **UI 界面展示**：在本地权威 Skill 列表下方展示独立的“检测到未托管的技能 (Untracked)”面板，展示其来源目标、技能名称、绝对路径。
- **一键托管导入**：为每一条未托管的技能配置“导入”操作按钮，点击后自动将其绝对路径传入导入 API 完成一键导入并刷新，直接将其收编管理。

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
%USERPROFILE%\.gemini\antigravity-ide\plugins\justafter-skill-manager\skills\<skill-name>
```

Gemini 项目规则文件：

```text
<project>\GEMINI.md
```

Antigravity 用户级同时生成：

```text
%USERPROFILE%\.gemini\antigravity-ide\plugins\justafter-skill-manager\plugin.json
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

- 完成 Antigravity 插件目录写入。
- 自动生成 `plugin.json`。
- 验证 Antigravity 是否能加载同步后的 Skill。
- 完成 Watch Mode，默认仅对用户主动开启的 Skill 生效。

## 首版验收标准

- 能导入一个标准 `SKILL.md` 目录，并在 UI 和 CLI 中展示。
- 能扫描 Claude、Codex、Antigravity 三类目标的安装状态。
- 能把同一个 Skill 同步到 Claude 和 Codex 的用户级目录。
- 能注册一个项目，并扫描该项目中的 Agent 相关文件。
- 能选择项目，把指定 Skill 注入到项目级 `.claude/skills` 或 `.agents/skills`。
- 能选择项目，生成 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 更新计划。
- 能以托管块模式更新已有规则文件，且保留非托管内容。
- 能把项目中的规则文件拉取回模板库。
- Antigravity 如果加载成功，则同步到其插件 skills 目录；如果加载失败，必须在 UI 中明确显示为“路径已写入但加载未验证”。
- dry-run 模式下不产生任何文件变更。
- 每次覆盖写入前都能生成备份。
- 目标端出现非本工具管理的同名 Skill 时不覆盖，并提示冲突。
- 项目规则文件存在且无托管块时不自动覆盖，必须展示 diff 并等待确认。
- 能从备份恢复一次同步前状态。
- UI 中能清楚看到每个 Skill 在每个 agent 和每个项目下的状态。
- CLI 和 UI 对同一份 `registry.json` 与 `config.json` 的读写结果一致。

## 风险与待确认问题

- Antigravity 的自定义插件目录是否会自动加载仍需实机验证。
- Codex 当前更推荐 `%USERPROFILE%\.agents\skills`，但本机也存在 `%USERPROFILE%\.codex\skills`，后者首版只扫描不默认写入。
- 项目级 Skill 注入可能与用户手写项目配置冲突，必须默认 dry-run。
- 规则文件更新风险较高，必须支持 diff、备份和托管块更新。
- Watch Mode 自动覆盖风险较高，首版必须默认关闭，只对用户显式开启的 Skill 生效。
- 多向同步中仅凭 `mtime` 判断最新版本可能受复制时间影响，后续可增加变更来源标记或提交记录。
- 备份目录可能快速膨胀，需要提供最大保留数量或清理策略。
- 如果多个 agent 同时修改同一个 Skill，首版只标记冲突，不自动合并。
- 如果多个项目的规则文件都被拉取为模板，需要提供模板命名和覆盖确认策略。

## 默认假设

- 首版只服务个人本机使用，不考虑多用户并发修改冲突。
- 优先稳定同步，不追求远程市场能力。
- 项目级规则文件默认采用托管块更新，除非用户明确选择覆盖。
- Antigravity 适配基于当前本机目录结构。
- 如果 Antigravity 实际加载失败，首版保留扫描和备份能力，写入目标先限制为 Claude / Codex。

## 后续实施边界

- 本笔记只记录计划，不代表已经创建 `D:\AgentSkillManager`。
- 后续开始开发前，应先确认仓库位置、技术栈、项目级写入策略和首版验收标准。
- 若首版只服务本机，不需要先做安装包或远程发布机制。
