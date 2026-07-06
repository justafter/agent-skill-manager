# AGENTS.md

<!-- BEGIN AgentSkillManager:codex -->
## 项目定位

本项目是本地优先的 Agent Skill Manager，用于统一维护 Agent Skills、项目级 Agent 规则文件，并同步到 Claude Code、Codex、Gemini / Antigravity 等本机 Agent 环境。

## 必读上下文

开始工作前按顺序阅读：

1. `.agents/AGENT_COLLABORATION.md`
2. `1、需求/Skill管理器建设计划.md`
3. `4、计划/首版需求拆分与开发任务.md`
4. 与当前任务相关的 `2、架构/`、`3、详细设计/` 和源码文件

如果任务涉及特定角色，继续阅读 `.agents/architect_agent.md`、`.agents/planner_agent.md`、`.agents/developer_agent.md` 或 `.agents/tester_agent.md`。

## 当前开发优先级

默认优先推进 D0-D3：

1. D0 基础设施补齐
2. D1 Skill 导入与注册表
3. D2 用户级 scan / list / diff
4. D3 用户级 sync plan / apply / backup / tag

除非用户明确调整，不要提前扩展到远程市场、ZIP 安装、系统托盘、多用户权限、复杂规则合并。

## 协作规则

- 以当前仓库状态和用户明确要求为准，不凭空扩大范围。
- 修改前先检查相关文档、代码和 `git status`。
- 不覆盖用户或其他 Agent 的未确认改动。
- 不做无关重构、无关格式化或无关依赖升级。
- 文档、代码、测试需要保持一致；架构或任务变化要同步到对应文档。
- 交接时说明已完成、未完成、修改文件、验证结果、风险和下一步。

## 实现约束

- CLI、server、Web UI 不得各自实现一套核心写入逻辑；写入逻辑必须沉到 `src/core`、`src/sync`、`src/backup`、`src/projects` 或 `src/rules` 等共享模块。
- 写入 Agent 目录或项目目录前必须先生成 plan / dry-run。
- apply 必须基于已确认计划。
- 覆盖前必须备份。
- 非本工具管理的同名目标默认冲突，不自动覆盖。
- 项目级写入必须校验真实路径落在注册项目内部。
- 新增依赖必须有明确必要性；优先使用当前技术栈和现有工具函数。

## 验证要求

- 纯文档改动：检查路径、链接和内容归属。
- 类型或纯函数：运行 typecheck 和相关测试。
- CLI 行为：实跑 CLI 命令并补充集成测试。
- server API：验证路由入参、错误响应和核心逻辑复用。
- Web UI：验证真实 API 数据、交互状态和写入确认流程。
- 文件写入逻辑：必须覆盖临时目录、dry-run、备份、恢复、冲突和路径越界场景。

无法运行验证时必须说明原因，不得把未验证内容描述为已验证。

## 输出要求

面向用户输出时保持直接、具体：

- 说明改了什么。
- 说明验证了什么。
- 说明还有什么风险或未完成项。
- 文件路径使用可定位的项目路径。
<!-- END AgentSkillManager:codex -->
