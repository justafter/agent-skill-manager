# 项目架构

> Skill 管理器（Agent Skill Manager）- 架构总览
> 配套文档：[项目目录](../3、详细设计/项目目录.md) · [技术架构](./技术架构.md) · [建设计划](../1、需求/Skill管理器建设计划.md)

## 1. 架构定位

Skill 管理器是一个**本地优先**的 Agent Skills 统一管理工具，承担三个核心角色：

1. **Skill 库管理员**：作为本机统一的 Skill 源（`library/skills`），收纳、校验、注册所有 Agent Skills。
2. **多 Agent 同步引擎**：把本地 Skill 推送到 Claude Code / Codex / Gemini-Antigravity 等目标 Agent 的用户级与项目级目录。
3. **项目规则同步器**：管理 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 等项目级 Agent 规则文件，支持托管块更新、模板拉取。

```
┌─────────────────────────────────────────────────────────────┐
│                  本地 Skill 管理器 (本仓库)                 │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Web UI  │  │   CLI    │  │  本地API │  │  配置文件│   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       └──────────┬──┴──────────────┴────────────┘          │
│                  │                                          │
│            ┌─────▼─────┐                                    │
│            │  核心引擎  │ ← 同步引擎 + 规则引擎             │
│            └─────┬─────┘                                    │
│       ┌──────────┼──────────┐                               │
│       │          │          │                               │
│  ┌────▼───┐ ┌───▼────┐ ┌───▼─────┐                          │
│  │ Skill  │ │ Agent  │ │ 项目工作│                          │
│  │ 解析   │ │ 适配器 │ │   区    │                          │
│  └────────┘ └────────┘ └─────────┘                          │
└─────────────────────────────────────────────────────────────┘
                │              │              │
        ┌───────▼──────┐ ┌────▼─────┐ ┌──────▼───────┐
        │ Claude Code  │ │  Codex   │ │  Gemini /     │
        │ 用户/项目级   │ │ 用户/项目│ │  Antigravity  │
        └──────────────┘ └──────────┘ └───────────────┘
```

## 2. 架构分层

采用 **四层架构**，由上至下：

| 层级 | 名称 | 职责 | 主要技术 |
| --- | --- | --- | --- |
| L1 | 表现层 | 用户交互、状态展示、确认与 diff | React + Vite（Web UI）<br>Commander.js（CLI） |
| L2 | 接口层 | REST API 路由、参数校验、plan/apply 协议 | Express.js |
| L3 | 核心引擎 | 同步引擎、规则引擎、备份恢复、校验、计划/应用分离 | TypeScript 核心库 |
| L4 | 适配层 | 文件系统适配、Agent 适配、项目工作区、规则模板解析 | Node.js fs/promises、gray-matter、chokidar |

**关键设计原则**：

- **Plan / Apply 分离**：所有写入操作必须先 `plan` 生成 dry-run 计划，再 `apply(planId)` 真正执行；UI 看到的内容与执行内容必须严格一致。
- **完全复制**：默认使用 `fs.cp` 复制而非符号链接，规避跨分区与软链接权限问题。
- **管理标记**：每次写入目标端都生成 `.skill-manager-deploy.json`，用于后续冲突检测与"自我进化"识别。
- **托管块优先**：规则文件默认采用 `<!-- BEGIN/END AgentSkillManager:<agent> -->` 标记块，保留项目自有内容。

## 3. 核心子系统

### 3.1 Skill 解析与校验

负责把磁盘上的 Skill 目录转换为可注册对象：

```
SKILL.md (Markdown + YAML frontmatter)
   │
   ▼
gray-matter 解析 frontmatter
   │
   ▼
校验: name 必填、description 必填、name 与目录名一致
   │
   ▼
内容 fingerprint
   │
   ▼
checksum: 相对路径 + 文件内容的 SHA-256
lastModified: 目录内文件 mtime 最大值
   │
   ▼
SkillMeta { name, version, description, localPath, checksum, lastModified, resources }
```

`checksum` 用于判断内容是否相同；`lastModified` 只用于多端扫描时推断最新来源，不能混入内容 checksum。

**失败策略**：

- 缺 `SKILL.md` → 拒绝导入。
- 缺 `name` 或 `description` → 拒绝导入并报错。
- `name` 与目录名不一致 → 首版**拒绝**（避免多端识别不一致）。

### 3.2 Agent 适配器

每个 Agent 一个适配器，**只暴露统一接口**，不决定冲突策略。

| 适配器 | 用户级路径 | 项目级路径 | 项目规则文件 |
| --- | --- | --- | --- |
| `ClaudeAdapter` | `%USERPROFILE%\.claude\skills\` | `<project>\.claude\skills\` | `<project>\CLAUDE.md` |
| `CodexAdapter` | `%USERPROFILE%\.agents\skills\` | `<project>\.agents\skills\` | `<project>\AGENTS.md` |
| `GeminiAntigravityAdapter` | `%USERPROFILE%\.gemini\antigravity-ide\plugins\justafter-skill-manager\skills\` | `<project>\.gemini\skills\` | `<project>\GEMINI.md` |

**统一接口（Adapter contract）**：

```text
detect()                  → boolean                 // Agent 是否在本机存在
scanUserSkills()          → SkillState[]            // 用户级已安装 Skill
scanProjectSkills(p)      → SkillState[]            // 项目级已安装 Skill
planInstall(skill, scope) → Plan                    // 生成 dry-run 计划
install(skill, scope)     → InstallResult           // 执行安装（仅由 apply 层调用）
remove(skill, scope)      → RemoveResult            // 卸载（仅由 apply 层调用）
getRuleFile(project)      → RuleFileState           // 项目规则文件状态
planRuleUpdate(...)       → RulePlan                // 规则更新计划
applyRuleUpdate(...)      → RuleApplyResult         // 规则写入结果
```

### 3.3 项目工作区

管理"按项目注入"这一关键能力。注册信息存于用户级配置 `~/.skill-manager/config.json` 的 `projects[]`：

```jsonc
{
  "id": "obsidian-notes",
  "name": "Obsidian笔记",
  "path": "D:\\Obsidian笔记",
  "enabledAgents": ["claude", "codex"],
  "allowProjectSkill": true,
  "allowProjectRule": true
}
```

**安全约束**：

- 只允许写入 `path` 内部。
- 所有写入必须 `plan → apply`。
- 写入前自动备份。
- 目标端有同名 Skill 或规则文件时**必须展示 diff**。

### 3.4 同步引擎

核心算法：

```
输入: sourcePath, targetPath, registry, scope
  │
  ▼
1) 读取 sourcePath 全部文件 → 生成 sourceChecksum (按相对路径 + 文件内容 SHA-256)
2) 读取 targetPath 全部文件 → 生成 targetChecksum
3) 比对 → 分类:
     - new:    target 不存在
     - modify: 两者都存在但 checksum 不同
     - skip:   两者都存在且 checksum 相同
     - conflict: target 存在但无管理标记 且 checksum 不同
  │
  ▼
4) 对 conflict 默认暂停；其它由用户确认
5) 备份 targetPath → backupDir/<backupId>/...
6) 复制 sourcePath → targetPath
7) 在 targetPath 写入 .skill-manager-deploy.json
```

### 3.5 规则模板同步

**三种更新模式**：

| 模式 | 适用 | 行为 |
| --- | --- | --- |
| `overwrite` | 新项目 / 用户确认完全采用模板 | 整文件覆盖原文件 |
| `block` | 已有项目，保留自有内容 | 只更新 `<!-- BEGIN/END AgentSkillManager:<agent> -->` 之间的内容 |
| `pull-template` | 把项目规则回收到模板库 | 读取项目规则文件，保存为 `library/rules/<agent>/<name>.md` |

**默认策略**：

- 目标规则文件不存在 → 直接新建。
- 存在且包含托管块 → 块更新。
- 存在但无托管块 → 展示 diff，**不自动覆盖**。

### 3.6 备份与恢复

**粒度**：

- 单 Skill / 单规则文件 → 独立备份。
- 批量同步 → 一次生成 batch 备份索引。

**索引结构**：

```json
{
  "backupId": "20260703-153000",
  "createdAt": "2026-07-03T15:30:00+08:00",
  "reason": "before-project-inject",
  "items": [
    { "type": "skill", "skillName": "...", "target": "claude:project",
      "originalPath": "...", "backupPath": "..." }
  ]
}
```

**恢复**：从 `backupId` 还原，可选单 item 或整批。

### 3.7 Watch Mode（开发者热同步）

基于 `chokidar` 监听已导入 Skill 的 `localPath`：

- 监听 `SKILL.md`、`scripts/`、`references/`、`assets/`。
- **默认关闭**，仅对用户显式开启的 Skill 生效。
- 触发后只推送 Skill，不自动推送规则文件。
- 写入成功后 UI 显示 `lastSyncedAt` 与 Toast。

## 4. 数据模型

### 4.1 用户级配置 `~/.skill-manager/config.json`

运行时配置由仓库根 `skill-manager.config.json` 的默认值与用户级配置合并生成；下面示例展示合并后的结构。

```json
{
  "backupDir": "D:\\AgentSkillManager\\backups",
  "devDir": "D:\\MySkillDevelopment",
  "ruleTemplateDir": "D:\\AgentSkillManager\\library\\rules",
  "targets": {
    "claude": { "enabled": true, "userSkillPath": "...", "projectSkillPath": ".claude\\skills", "projectRuleFile": "CLAUDE.md" },
    "codex":  { "enabled": true, "userSkillPath": "...", "projectSkillPath": ".agents\\skills", "projectRuleFile": "AGENTS.md" },
    "gemini": { "enabled": true, "userSkillPath": "...", "projectSkillPath": ".gemini\\skills", "projectRuleFile": "GEMINI.md" }
  },
  "projects": [
    { "id": "obsidian-notes", "name": "Obsidian笔记", "path": "D:\\Obsidian笔记", "enabledAgents": ["claude", "codex"] }
  ]
}
```

### 4.2 注册表 `registry.json`

```json
{
  "skills": {
    "comfyui-video-gen": {
      "name": "comfyui-video-gen",
      "version": "1.0.0",
      "localPath": "D:\\MySkillDevelopment\\comfyui-video-gen",
      "checksum": "sha256:a1b2c3...",
      "syncedTargets": ["claude:user", "codex:user"],
      "projectInstalls": [
        { "projectId": "obsidian-notes", "target": "claude:project", "checksum": "sha256:a1b2c3..." }
      ]
    }
  }
}
```

### 4.3 管理标记 `.skill-manager-deploy.json`

部署在每个由本工具写入的 Skill 目录根：

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

## 5. 关键流程

### 5.1 导入 Skill

```
用户: asm import D:\MySkillDevelopment\comfyui-video-gen
   │
   ▼
1) core/validation.parseSkillDir(localPath)
2) 校验通过 → 计算 checksum
3) registry.json 写入条目
4) 返回 SkillMeta 给 CLI/UI
```

### 5.2 同步到目标

```
用户: asm sync comfyui-video-gen --to claude:user
   │
   ▼
1) ClaudeAdapter.planInstall(skill, 'user') → Plan
2) UI/CLI 展示 Plan（含 diff / 备份位置 / 风险点）
3) 用户确认 → core/apply.applyPlan(planId)
4) 备份目标 → fs.cp 复制 → 写入 .skill-manager-deploy.json
5) 更新 registry.syncedTargets
```

### 5.3 项目级注入

```
用户: asm project inject obsidian-notes comfyui-video-gen --agent claude
   │
   ▼
1) 校验项目已注册 & path 合法
2) ClaudeAdapter.planInstall(scope='project', projectId='obsidian-notes')
3) 展示 dry-run + diff
4) 用户确认 → 备份 + 复制 + 写入管理标记
5) 更新 registry.projectInstalls
```

### 5.4 项目规则更新（托管块模式）

```
用户: asm project push-rules obsidian-notes --agent codex --mode block
   │
   ▼
1) 读取 library/rules/codex/AGENTS.md 模板
2) 扫描项目 AGENTS.md，定位 BEGIN/END 托管块
3) 块存在 → 替换块内容；块不存在 → 追加托管块
4) 备份原文件
5) 写入新文件
```

### 5.5 多向同步（"自我进化"识别）

```
用户: asm scan
   │
   ▼
1) 扫描 devDir（本地开发目录）
2) 扫描 registry 中所有 target 的 installed 状态（含 checksum + lastModified）
3) 扫描注册项目中的项目级 Skill
4) 对每个 Skill 比对所有端点：
     - latestSource = 在 checksum 不同的端点中按 lastModified 推断的最新端
     - 其它端落后 → 在 UI 高亮"该端落后于其他端"
5) 用户选择 pull / push / cross-sync
```

## 6. 安全与边界

- **写入范围限制**：项目级写入只允许 `project.path` 内部；目标端写入只允许 `config.targets[*].userSkillPath` / `projectSkillPath` 内部。
- **冲突处理**：目标端存在但无管理标记 → 不覆盖，必须显式 confirm。
- **Plan / Apply 分离**：所有写接口的 `apply` 必须携带 `planId`，确保执行内容与展示一致。
- **dry-run 强制**：M1 之后任何写接口默认 `dryRun: true`，用户必须显式确认。
- **备份前置**：任何覆盖写之前都自动备份到 `backupDir`。
- **Watch Mode 边界**：默认关闭，不自动同步规则文件。

## 7. 可扩展性

**已留扩展口**：

| 扩展点 | 当前 | 后续 |
| --- | --- | --- |
| Agent 适配器 | Claude / Codex / Gemini-Antigravity | OpenCode / Hermes / Cursor / Windsurf |
| 安装来源 | 本地目录导入 | ZIP 安装、远程市场 |
| 规则合并 | 单模板整文件 / 托管块 | 多模板组合（通用 + Agent 专用 + 项目类型） |
| 同步策略 | 完全复制 | 符号链接、差异同步 |
| 更新检查 | 本地 checksum / lastModified 比对 | 联网版本源 |

## 8. 验收口径（首版）

- 能导入、扫描、列出、同步、备份、恢复一个标准 Skill。
- 能把同一 Skill 同步到 Claude、Codex 的用户级目录。
- 能注册项目并把 Skill 注入项目级 `.claude/skills` / `.agents/skills`。
- 能以 `block` 模式更新 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 且保留非托管内容。
- dry-run 不产生任何文件变更。
- 目标端存在非本工具管理的同名 Skill 时不覆盖并提示。
- CLI 与 UI 对同一份 `library/registry.json` / `~/.skill-manager/config.json` 读写结果一致。
