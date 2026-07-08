# 2026-07-08 删除功能覆盖盘点

> 这是一份只读盘点文档，不是设计稿。它把"删除"相关能力在当前仓库中的真实覆盖度摆出来，
> 标注空白点，作为后续是否进入 writing-plans 的输入。

## 1. 盘点口径

- **范围**：Skill / Rule 模板 / Project 三个维度上的所有"删除 / 卸载 / 清理"动作。
- **方法**：源码 + 文档 + 测试，只读 grep + 关键文件人工核对。不跑 CLI、不跑 Web、不修改任何文件。
- **关键查询关键词**：`remove`、`delete`、`uninstall`、`unlink`、中文 `卸载 / 删除 / 移除`，以及对应函数与路由名。
- **截止 commit**：`a05bc3e feat: 实现本地Skill管理器核心功能并完善所有测试用例`（2026-07-07）。

## 2. 总览：删除能力覆盖矩阵

| 维度                     | 命令 / API                                              | 实现位置                                       | 测试                                                  | UI 入口                                              | 结论 |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------- | ---- |
| Skill 本地库记录删除     | **不存在**                                              | —                                              | —                                                     | 无                                                    | 缺口 |
| Skill 用户级卸载         | **不存在**（sync 引擎仅同步，无卸载动作）               | —                                              | —                                                     | 无                                                    | 缺口 |
| Skill 项目级卸载         | **不存在**（`projects/inject.ts` 只 plan/apply 不写 unload） | —                                              | —                                                     | 无                                                    | 缺口 |
| Rule 模板删除            | **不存在**（`rules.ts` 仅 GET/POST/`/diff`）            | —                                              | —                                                     | 无                                                    | 缺口 |
| Rule 项目级文件回滚/移除 | **不存在**（`rules/apply.ts` 只 plan/apply，不删文件）  | —                                              | —                                                     | 无                                                    | 缺口 |
| 项目解除注册             | `asm project remove` / `DELETE /api/projects/:id`       | `src/projects/remove.ts`、`src/server/routes/projects.ts`、`src/cli/project.ts:341` | `tests/integration/project.test.ts`（已 grep 到 `remove`/`uninstall` 关键字，文件存在但未通读） | `ProjectSpacePage.tsx` 移除项目弹窗                  | **已实现**（仅解除注册，不删任何文件） |
| 备份清理策略             | 类型已声明（`BackupRetentionPolicy`），**无执行入口**   | `src/backup/cleanup.ts`                        | 无                                                    | 无                                                    | 缺口（仅策略接口） |
| Watch Mode 卸载          | 监听停止后**不清理目标**                                | `src/core/watch.ts`                            | `tests/integration/watch.test.ts`                     | SkillsPage 切换监听                                   | 仅停止监听 |

## 3. 关键证据

### 3.1 删除相关源码/测试命中

`src/` 内只命中 10 个文件，但 8 个是"项目解除注册"链路及其类型声明（`plan.ts`、`state.ts`、`watch.ts`、`pidfile.ts`、`rules/diff.ts`、`cli/diff.ts`），真正的"删除业务逻辑"只有一处：

- `src/projects/remove.ts` —— **项目解除注册核心**（仅快照 `config.json`，从不删文件）。
- `src/server/routes/projects.ts` —— `GET /:id/remove-preview`、`DELETE /:id`。
- `src/cli/project.ts:341` —— `asm project remove` 子命令。

`tests/` 命中 4 个文件：

- `tests/integration/project.test.ts` —— 解除注册相关。
- `tests/integration/scan.test.ts`、`tests/integration/import.test.ts` —— 命中关键词为注释或变量名（"leftover"、"physical deletion"），不是删除业务测试。
- `tests/integration/backup.test.ts` —— 同上，仅"物理删除目标目录"等边界场景注释。

`web/` 仅 `web/src/pages/ProjectSpacePage.tsx` 一处 `remove*`（项目解除注册弹窗）。`SkillsPage.tsx`、`RulesPage.tsx`、`SkillCard.tsx` 全部 **0 命中**。

### 3.2 SkillCard 的能力盘点（UI 端最直观的证据）

`web/src/components/SkillCard.tsx` 全文 333 行，弹出的下拉菜单只有 3 个动作：

- `推送同步 (Push) ↑`
- `反向拉取 (Pull) ↓`（仅 changed/conflict 时出现）
- `同步所有目标`

**没有任何 "卸载 / 从目标中移除 / 清理已安装路径" 入口**。

### 3.3 Adapter 类型契约

`src/types/adapter.ts:29-34` 的 `Adapter` 接口：

```ts
export interface Adapter {
  readonly agent: AgentId
  detect(): Promise<boolean>
  getTargetPaths(): AdapterTargetPaths
  scanUserSkills(): Promise<Record<string, TargetSkillInfo>>
}
```

> 注意：`Adapter` 接口规范文档（`1、需求/Skill管理器建设计划.md`）里列出的 `planInstall / install / remove / planRuleUpdate / applyRuleUpdate` **首版只落到了 Adapter 类型之外的更高层（projects/inject、sync/engine、rules/apply）**。**`remove` 接口方法从未在任何 adapter 上实现**，也未在 `Adapter` 类型中声明。这与建设计划的"首版范围"完全一致，但确实意味着 **没有用户级 Skill 卸载能力**。

### 3.4 rules.ts 路由清单

`src/server/routes/rules.ts` 全部路由：

- `GET /api/rules` —— 列出模板 + 项目级安装路径。
- `POST /api/rules` —— 创建空模板。
- `GET /api/rules/diff` —— diff 预览。

**没有 DELETE / PUT(覆盖模式以外) / 模板级 unbind**。

### 3.5 sync / projects / projects.inject 写接口清单

- `src/server/routes/sync.ts`：`POST /api/sync/plan`、`POST /api/sync/apply`，无卸载。
- `src/server/routes/projects.ts`：`GET`、`POST`、`POST /:id/inject/plan`、`POST /:id/inject/apply`、`GET /:id/rules/diff`、`POST /:id/rules/sync`、`POST /:id/rules/cross-sync`、`PUT /:id/rules/template`、`GET /:id/remove-preview`、`DELETE /:id`。
- `src/projects/inject.ts` 内 grep `remove|delete|uninstall` **0 命中**。

## 4. 与建设计划/计划文档的一致性

`1、需求/Skill管理器建设计划.md` 中提及的 Skill/Rule 删除相关条目：

- 段落"导入目录与已安装路径展示"：提到"删除等操作"但仅作为卡片应有操作列表，未细化。
- 段落"5. 同步策略与冲突处理"：删除语义只在 **resolve 到 modify 时覆盖前自动备份**，没有显式删除流程。
- `4、计划/首版需求拆分与开发任务.md` D3/D7/D8 验收项：均未列出 "卸载 / 删除 Skill"、"删除 Rule 模板"、"删除项目级 Rule 文件"。

**也就是说：当前实现的"无删除功能"不是 bug，而是与建设计划、计划文档、首版验收口径一致——首版范围里没有显式定义删除能力。**

## 5. 识别出的真正缺口

按"用户真实场景 × 现有能力"重新审视，归纳出 3 类缺口：

### 缺口 A：Skill 从目标 Agent 中移除（用户级 + 项目级）

**用户场景**：换 Skill 主题、试错后想清理 Agent 目录里残留的旧 Skill；项目不再使用某些注入的 Skill。

**当前能做**：

- 仅解除项目注册（保留所有文件），但 Skill 仍占着 `<userSkillPath>/<skill-name>` 与 `<project>/.claude/skills/<skill-name>`。
- 在 `SkillsPage` 看到 installedPaths，但点不动"卸载"。

**缺失**：

- core 层：`removeSkill(skillName, target, opts?)`，含备份当前目标 → 删除目录 → 更新 `registry.syncedTargets` / `registry.projectInstalls`。
- adapter 层：`Adapter.remove(skillName, scope)` 或等价方法（`BaseAdapter` 没有该方法，需新增抽象）。
- CLI：`asm skill remove <name> --target claude:user [--purge-local]`、`asm project uninject <project-id> <skill-name> --agent <agent>`。
- API：`DELETE /api/skills/:name/targets/:target`、`POST /api/projects/:id/inject/uninstall`。
- UI：SkillCard 加"从该 Agent 移除"菜单项；ProjectSpacePage 注入面板加"卸载"按钮。
- 测试：dry-run 不写盘、备份存在、registry 更新、冲突保护（非托管目录默认不删）。

### 缺口 B：Rule 模板与项目级规则文件移除

**用户场景**：模板写错了想删；项目里某个 Agent 的规则文件想回退到"无托管"。

**当前能做**：

- `pull` 把项目文件覆盖到模板（增加），不能删。
- 没有 unbind 模板的入口（`PUT /rules/template` 支持 `templateName: null` 但仅是解绑，不是删模板）。

**缺失**：

- core 层：`deleteRuleTemplate(agent, name)`（带本地库模板的备份）、`resetProjectRule(projectId, agent, mode)`。
- API：`DELETE /api/rules`、`DELETE /api/projects/:id/rules`。
- UI：RulesPage 模板卡片加"删除模板"，加"从项目解除"。

### 缺口 C：本地 Skill 库整体清理（保留 vs 移除注册记录）

**用户场景**：不想再维护某个 Skill，想从 `library/registry.json` 中完全消失（包括 `projectInstalls` 历史记录）。

**当前能做**：

- 仅能"更新本地库"（用 `localPath` 覆盖），不能"删除 Skill 注册记录"。
- `removeProject` 只动 config，不动 registry。

**缺失**：

- core 层：`removeSkillFromRegistry(skillName, opts?)`，可级联清理 `library/skills/<name>` 目录。
- 安全约束：与 `removeProject` 保持一致——必须先备份 `library/skills/<name>` 与 registry snapshot；必须二次确认；可保留"仅注销，不删本地库副本"模式。
- CLI：`asm skill remove <name> [--purge-library]`。
- API：`DELETE /api/skills/:name`。
- UI：SkillCard 加"从本地库移除"，二次确认弹窗。

### 缺口 D（次要）：备份清理入口

`src/backup/cleanup.ts` 仅声明了 `BackupRetentionPolicy` 类型与默认值，**没有执行入口**。属于"D4 备份恢复"任务里"D0/D4 范围提到但未做"的尾巴，影响面较小。

## 6. 风险与边界

- **删除是不可逆操作**。即使有备份，用户也可能忘记去 restore。设计上需要"删除前自动备份" + "二次确认" + "删除后给一个能跳到备份的链接"三件套。
- **非托管目标**（即用户在 Agent 目录下自己建的 Skill 目录，本工具没有 `.skill-manager-deploy.json` 标记）默认 **不允许删除**——这与现有冲突策略一致（`src/core/conflict.ts`）。
- **项目级 Skill 卸载必须受 `assertInsideProject` 保护**。现有 `inject.ts` 已经满足；新加的 uninstall 复用同一保护即可。
- **删除 Skill 注册记录不应连带删除已注入的项目级副本**——这一点与"项目解除注册"语义保持一致（`removeProject` 的设计原则是"不动文件"）。

## 7. 建议下一步（不进入实现）

建议在决定"是否实现删除"前，先与你确认两件事：

1. **缺口 A、B、C 中哪些要做**？A 是最常用的（"我换 Agent 了"），C 是管理上的（"这个 Skill 我不再维护了"），B 与规则体系相关。
2. **是否需要走 plan/apply 流程**？建议沿用现有 plan/apply 范式：先 plan 出"将删除哪些目录 / 文件 / registry 字段"，确认后再 apply；删除前自动备份。

如果你确认要做，我会按缺口 A → 缺口 B → 缺口 C 的顺序进入 **writing-plans** 拆分实现计划，每缺口一份独立 plan 文档并配上对应的集成测试场景（dry-run、备份、registry 更新、冲突保护、路径越界）。