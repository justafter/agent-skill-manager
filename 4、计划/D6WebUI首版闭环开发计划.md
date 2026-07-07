# D6 Web UI 首版闭环开发计划

本计划针对 M1/D6 阶段的 Web UI 工作，目标是让 Web 页面真实管理 Skill，而不是展示占位行。Web UI 所有写操作统一调本地 HTTP API，不直接访问文件系统；与 CLI、server 共用同一套核心能力。

## 涉及文件

- `web/src/App.tsx` - 路由与顶部导航
- `web/src/pages/SkillsPage.tsx` - Skill 列表、扫描、同步 plan/apply、确认弹窗；与 D3a/D3b 同步流程绑定；首页内"导入技能"按钮 + modal 表单（合并自原 ImportPage，详见 §2.x NewImport）；未托管列表的"一键导入"
- `web/src/pages/BackupPage.tsx` - 备份列表与还原二次确认
- `web/src/pages/ProjectSpacePage.tsx` - 项目空间（D7 实施后再细化），项目卡片支持展开"已安装路径"折叠区
- `web/src/pages/RulesPage.tsx` - Rule 模板库（独立路由 `/rules`），仅项目级；详见 §2.11
- `web/src/components/SkillCard.tsx` - 单 Skill 行，多目标状态徽标 + 同步 / 拉回按钮 + 卡片底部"查看已安装路径"折叠 + 描述下方常驻"导入目录"行
- `web/src/components/DirectoryPicker.tsx` - 通用目录选择器（手动 / `showDirectoryPicker` / `<input webkitdirectory>` 三模式；用于首页导入与项目添加，详见 §2.x DirPicker）
- `web/src/components/PlanConfirmDialog.tsx` - plan 确认窗口，必须展示冲突项与 apply 按钮置灰规则
- `web/src/components/DiffView.tsx` - 文本级 diff 渲染
- `web/src/components/ProjectList.tsx` - 项目列表（D7 实施后再细化）
- `web/src/components/RuleTemplateEditor.tsx` - 规则模板编辑（D8 实施后再细化）
- `web/src/hooks/useApi.ts` - 基于 react-query 的数据获取
- `web/src/hooks/usePolling.ts` - 轮询封装（当前是 stub）
- `web/src/hooks/useToast.ts` - 全局错误 / 成功提示（当前是 stub）
- `web/src/api/client.ts` - fetch 封装

## 1. 设计原则

- **所有写入走 API**：UI 不能直接调用 `src/core/*` 或 `src/sync/*`；必须通过 `web/src/api/client.ts` 调本地 API。这条边界与 D5 一致。
- **plan/apply 协议**：UI 同步流程必须严格走"调 `/api/sync/plan` → 展示 `PlanConfirmDialog` → 用户确认 → 调 `/api/sync/apply`"三步。
- **错误统一展示**：所有 API 错误统一走"toast 或 dialog"，不再用浏览器原生 `alert()` / `confirm()`。D6 阶段先把 `alert()` 替换为 toast，`window.confirm` 保留作为过渡。
- **冲突项标红禁止 apply**：`PlanConfirmDialog` 必须把 `kind === 'conflict'` 的项标红，且 apply 按钮在仍有未处理冲突时禁用。
- **不重复核心逻辑**：diff 等计算必须落在 server 端。

## 2. 拟实施工作项

### 2.1 SkillsPage 接入 D3a/D3b 同步流程

- **保留** `triggerPlan(skillName, toTarget?, fromTarget?, allowManagedModify?)`。
  - 当 `toTarget === 'local'` 且 `fromTarget` 存在 → 反向拉取请求体：`{ skillName, from: fromTarget }`。
  - 其他情形 → 推送请求体：`{ skillName, targets: [toTarget] }`。
- **删除** 旧 `handlePlanSync` 残留：旧版本含有未完成的条件分支（被 `// wait` 注释打断），且未被任何调用方引用。
- **修复** `SkillCard` 拉回按钮调参：`onPlanSync('local', targetKey)` 与 D3b 路由一致（`to=local, from=targetKey`）。当前实现已正确，仅需在 D6 计划中固化。
- **拉回按钮的可见条件**：仅当 `status === 'changed' || 'conflict'` 时显示（与 D3a 一致）；D6 不在本阶段改变状态判定规则，D3b 的"远端可拉回"状态（远端 hash 不同于本地、远端无 deployTag）由 server 端 `/api/skills` 增强后判定，详见 §5 待确认。
- **`handleAllowManagedModifyChange`**：勾选后立即重新 plan，行为保持现状；但 race 中要避免在 `currentSkill` 切换后丢失上下文。
- **`handleConfirmSync` 错误处理**：失败时把错误写入 `planErrorMessage` 显示在 dialog 内（已有），D6 不再改用 alert。

### 2.2 PlanConfirmDialog 冲突可视化

- `kind === 'conflict'` 的 plan item 必须用红底样式（`background: '#ffebe9'`、`color: '#cf222e'`），并在右上角显示 `!` 图标。
- `summary.conflict > 0` 时：
  - 顶部出现红底警告条（已有）。
  - **apply 按钮置灰**，需用户先解决冲突（取消 dialog 或在 dialog 外的对应 skill 行操作）。
- `summary.create === 0 && summary.modify === 0` 时按钮置灰（已有）。
- D6 不允许"有未处理冲突时静默 apply"。

### 2.3 useToast 与 usePolling 替换 stub

- `useToast`：基于 react state + context 提供，导出 `useToast()` → `{ show(message, severity?: 'info' | 'success' | 'error') }`。
  - 替换 `alert()` 的位置：`ImportPage`、`BackupPage`、`SkillsPage.handleScan`、`SkillsPage.triggerPlan`。
  - `BackupPage.handleRestore` 暂保留 `window.confirm` 作为二次确认，因为 restore 是不可逆的，阻塞式 dialog 仍然是合理 UI。
- `usePolling`：用 `useQuery({ refetchInterval })` 真正实现轮询，默认 5000ms。
  - `SkillsPage` 列表每 5s 刷新（与 scan 结果保持一致）。
  - `BackupPage` 列表每 5s 刷新，避免多端操作时不刷新。
- D6 不引入新依赖。

### 2.4 ImportsPage / BackupPage 错误反馈统一

- `BackupPage`：保留 `window.confirm` 作为 restore 二次确认；其他路径全部改用 toast。`alert('[Success] Restored successfully!...')` 改成 toast。
- `SkillsPage` 内的导入 modal（取代旧 `ImportPage`）保留当前的 `feedback` state 在表单内显示成功/跳过/失败三态；后台 toast 化推迟到 `useToast` 替换 stub 之后。

### 2.5 ProjectSpacePage 与 ProjectList 占位

- D6 阶段 ProjectSpacePage 保留占位（仅 `ProjectList(projects={[]})` 与一个无效"Add project"按钮），D7 实施时再补：
  - 项目列表接入 `GET /api/projects`。
  - 项目详情页接入 `POST /api/projects`、项目扫描、项目级 Skill 注入、规则同步。
- D6 在 ProjectSpacePage 顶部加一个明确的"D7 即将上线"提示，避免用户误以为功能缺失。

> 实施后续补：ProjectSpacePage 顶部 toolbar 增加"添加项目"按钮（已有）；项目卡片支持折叠展示"检测到 Skill 目录"与"检测到 Rule 文件"的绝对路径列表，复用 `<DirectoryPicker>` 的"路径行"样式（flex 居中、tag 等宽、`flex: 1; min-width: 0`）。

### 2.6 i18n 风格

- D6 阶段不引入 i18n 框架。
- 现有页面内出现中英文混用（SkillsPage 用中文 tabs，BackupPage 用英文）。D6 选择统一为中文（与 SkillsPage/ImportPage 当前风格一致）。
- 不在 D6 范围做完整翻译校对，仅修复明显不一致。

### 2.7 DiffView 与 RuleTemplateEditor

- 保持当前实现。`DiffView` 在 D6 仅在 console 或临时调试入口使用，不上正式 UI。
- `RuleTemplateEditor` 在 D8 实施时接入。

### 2.8 Skill 卡片新增"导入目录"与"已安装路径"展示

- 每个 `SkillCard` 描述文本下方常驻一行 `导入目录: <localPath>`（monospace、自动换行、hover 显示完整），来源是注册表 `registry.skills[name].localPath`。
- 卡片底部新增按钮 "查看已安装路径（<N> 处）▾"，点击展开一个折叠区。
- 折叠区按行展示 `<AGENT> · <user|project>` 标签 + 绝对路径：
  - 用户级绝对路径：来自 `adapter.scanUserSkills()` 扫到的 `TargetSkillInfo.localPath`，对应 `<userSkillPath>/<skillName>`。
  - 项目级绝对路径：由 `skill.projectInstalls[i].target` + 该项目的注册 `path` + `targets[agent].projectSkillPath` 拼出，格式 `<projectPath>/<projectSkillPath>/<skillName>`。
- 行内样式约束（与 D6 §2.5 项目卡片路径行同源）：
  - 单行 flex + `align-items: center`（视觉对齐到中间）。
  - 标签 `min-width: 90px; text-align: center`（CLAUDE·user / CODEX·user / GEMINI·user 等宽整齐）。
  - 路径 `<span>` 设 `flex: 1; min-width: 0`，确保窄列下 `word-break: break-all` 正常换行、不撑爆容器。
  - 行间 `padding: 4px 0` 留白。
- 服务端在 `GET /api/skills` 返回每个 skill 的 `installedPaths: Record<TargetKey, absolutePath>`，由 server 一次性算好，前端只负责渲染。

### 2.9 首页内"导入技能"入口（NewImport）

- 旧版独立的 `/import` 路由与 `ImportPage.tsx` 页面**已合并**到首页（Skill 列表）顶部的 toolbar，以**模态对话框**形式提供，导航栏不再保留"导入技能"项。
- 入口：首页 toolbar 左侧新增 `导入技能` 次按钮（普通样式），与右侧 `扫描目标目录` 主按钮并列。
- 字段：
  - 源目录路径（绝对路径，必填）。使用通用 `<DirectoryPicker>` 组件。
  - `强制覆写`（覆盖前会创建注册表与本地备份，默认关闭）。
  - `如果校验和一致则跳过`（默认关闭）。
- 行为：点击 `导入 Skill` 后调用 `POST /api/import`，参数 `{ path, force, skip }`。
- 反馈：成功/跳过/失败三类消息以彩色提示框显示在对话框内；成功后自动 `refetch()` Skill 列表，刷新"导入目录"行。
- 取消：右上角 `×` 或底部 `取消` 按钮，关闭对话框并清空当前输入与反馈。
- 同时，SkillsPage 已有的"未托管技能"面板上"一键导入"按钮行为保持不变（`path = untracked.item.path`，`force: false, skip: true`），不再与 NewImport 冲突。

### 2.10 通用目录选择器 `<DirectoryPicker>`

为所有需要"绝对目录路径"的输入框提供一致的三模式选择体验。组件首版用在两处：

- 首页"导入技能"对话框的源目录路径。
- 项目空间页"添加项目"对话框的项目路径。

设计原则：

- **永远不擅自编造路径**。浏览器安全沙箱下 `<input webkitdirectory>` 拿不到绝对路径；组件只把目录名回填给输入框，并以提示语告知用户补全。
- **能力检测**：组件挂载时探测 `window.showDirectoryPicker` 是否可用；可用则按钮直接调用 `showDirectoryPicker()`（Chromium 系列浏览器能拿到真实绝对路径）；不可用则 fallback 到 `<input type="file" webkitdirectory>`。
- **状态反馈**：组件内部维护 `idle / picked(native|webkit) / failed` 三种状态，分别用绿色成功提示、红色失败提示呈现。
- **可复用**：组件接受 `value / onChange / placeholder / disabled / hint` 标准 props，后续"备份恢复""批量导入"等流程可复用。
- **不入后端**：首版不引入 `/api/browse-dir` 等后端目录浏览接口；如需远程浏览（如 SSH/远端机器）后续再扩展。

### 2.11 Rule 模板库页面（独立路由）

Rule 展示能力与 Skill 对齐，但**仅项目级**（无用户级 Rule 同步）。

- 入口：顶部导航 `Rule 模板库` → `/rules`。
- **模板目录可配置**：服务端从 `config.ruleTemplateDir` 读取模板根目录，不再硬编码 `<root>/library/rules`。RulesPage 顶部 toolbar 显示当前模板目录 + "切换模板目录…"按钮（弹 modal，复用 `<DirectoryPicker>`）；后端 `PUT /api/config/rule-template-dir` 持久化到 `~/.skill-manager/config.json` 并自动 mkdir。
- 服务端：`GET /api/rules` 返回 `{ rules: [{ agent, name, localPath, installedPaths: [{ projectId, projectName, path, exists }] }] }`；`GET /api/rules/diff?projectId=<id>&agent=<agent>` 复用 `planRuleSync`。
- `installedPaths` 全量列出所有已注册项目对该 Rule 的项目级路径；不按 `enabledAgents` 过滤。
- 卡片元素：标题 + `<AGENT>` tag + 已注册项目数；常驻"本地模板路径"行；折叠区按项目分卡片：
  - 行样式：`<AGENT> · project` tag 等宽（`min-width: 90px; text-align: center`），项目名 + 路径 `flex: 1; min-width: 0`；与 Skill 卡片路径行同源。
  - 三个按钮：`查看 Diff` → 调 diff；`拉取 ↓` → mode=pull；`推送 ↑` → mode 自适应（conflict → overwrite，否则 block）。
  - 反馈：成功/失败以彩色提示框显示在项目卡片内。
- 设计约束：
  - **不引入用户级 Rule 概念**。Rule 没有"全局"安装路径；只有 `<AGENT> · project` 一种 scope。
  - 不改 `rules/plan.ts` / `rules/apply.ts` / `rules/template.ts` / `rules/block.ts`。
  - 涉及文件：新增 `src/server/routes/rules.ts`、`web/src/pages/RulesPage.tsx`；修改 `src/server/app.ts`、`web/src/App.tsx`。
- **页脚"项目内跨 Agent 互推"区块**（D8 §2.6）：
  - 按已注册项目分组，每组一张 `3 × 3` 互推矩阵；行=源 Agent、列=目标 Agent、对角线禁用。
  - 每格两个按钮：`block`（推荐；按托管块语义搬运）、`overwrite`（整文件覆写）。
  - 点击后 `window.confirm` 二次确认；结果以小字显示在格内。
  - 后端调 `POST /api/projects/:id/rules/cross-sync { sourceAgent, targetAgent, mode }`；触发核心函数 `crossSyncRule(...)`。

## 3. 验收口径

### 自动化测试

- 当前没有 Web UI 集成测试。D6 阶段不强求引入 Playwright（首版需求 §D7 测试拆分允许 e2e 可选）。
- 但需要在已有 `tests/integration/` 中补一个间接断言：CLI 调用与 server `/api/skills` 返回的 plan summary 一致。

### 手动检查

- 打开 Web UI，点 `Scan Target Directories`，列表刷新成功。
- 选一个 Skill 点击 `同步 ↑` → 弹 `PlanConfirmDialog` → 展示 source / items / 统计。
- 选一个 Skill 点击 `拉取 ↓`（在 changed/conflict 状态）→ 触发反向拉取 plan。
- `PlanConfirmDialog` 含 conflict 项时，apply 按钮置灰。
- 关闭窗口时不残留状态（`planResult` 清空）。
- 备份页创建备份、列表更新、还原二次确认、提示 toast。
- 错误场景：从 API 触发 `VALIDATION_ERROR`、`PLAN_NOT_FOUND`，UI 通过 toast 展示。
- Tab 切换：`全部 / 缺失 / 已同步 / 冲突 / 项目级` 计数正确。
- 首页导入流程：点击 `导入技能` → modal 弹出 → 输入路径或用 `DirectoryPicker` 选择目录（Chromium 浏览器应直接返回绝对路径，其他浏览器仅返回目录名） → 点击 `导入 Skill` → 反馈框显示成功/跳过/失败 → 列表自动刷新，对应 Skill 卡片下方出现 `导入目录: <localPath>`。
- 卡片路径展示：点击 `查看已安装路径（N 处）▾` → 折叠区按行展示 `<AGENT> · <user|project>` + 绝对路径；tag 等宽整齐，路径在窄列下能正常换行；点击 `收起 ▴` 折叠。
- 项目添加流程：点击 `添加项目` → modal 弹出 → 输入项目路径或用 `DirectoryPicker` 选择目录 → 探测逻辑自动推断 `enabledAgents`（含 codex/gemini 共享 `.agents` 的去重规则） → 列表刷新。
- Rule 模板库（独立路由）：点击导航 `Rule 模板库` → 进入 `/rules` → 3 张模板卡片显示本地模板路径与已注册项目数 → 展开"项目级安装路径"折叠区 → 每项目显示绝对路径 + 已存在/未创建 → 点击 `查看 Diff` 加载 patch → 点击 `推送 ↑` / `拉取 ↓` 触发同步，反馈框提示结果。

## 4. 风险与待确认

- **`alert()` 与 `confirm()` 残留**：D6 计划要求统一改 toast，但 `window.confirm` 在 `BackupPage.handleRestore` 暂留。其风险是阻塞 UI，但 restore 是不可逆操作，阻塞反而合理。D6 不迁移。
- **拉回按钮可见条件过宽**：当前显示条件是 `status === 'changed' || 'conflict'`，但 D3b 的真正可拉回判定应是"远端 hash 不同于本地、远端无 deployTag"，当前 UI 缺少这个粒度。**建议**：D6 阶段保持现有简单条件，D3b 落地时由 server `/api/skills` 增加 `pullAvailable` 字段，UI 改用该字段控制按钮显示。
- **状态轮询的副作用**：轮询每 5s 会触发 `/api/skills` 与 `/api/backups`，可能与用户正在编辑的 form 冲突。`useApi` 在 react-query 模式下仅重新渲染不重置本地 state，可接受。
- **i18n 不一致已存在**：D6 不全面翻译，只在新增文案时保持中文统一。
- **`PlanConfirmDialog` apply 按钮的"未处理冲突"逻辑**：当前 disabled 仅基于 `create === 0 && modify === 0`，冲突项不影响按钮。D6 必须修：增加 `hasConflict && !allowManagedModify` 时按钮置灰的判定。
- **DevTools / 生产构建**：Vite 构建产物是否会带 `react-query` devtools，是否影响用户首屏体积；D6 不在本阶段处理。
- **ProjectSpace 路由**：当前 `/projects` 已经挂载 `ProjectSpacePage`，但 D7 之前的"Add project"按钮是无效按钮。D6 阶段会标注"D7 即将上线"。

## 5. 与 D5 的协同

- D5 统一错误响应 `{ error: { code, message, details } }`，D6 需要从 `apiPost` 抛出的 Error 解析 code（当前 `client.ts` 只把 `errJson?.error` 作为字符串抛出）。D6 计划在 `client.ts` 增加一个 `ApiError` class，携带 `code` 字段，让 `useToast` / `PlanConfirmDialog` 能识别 `VALIDATION_ERROR` / `PLAN_NOT_FOUND` 等码并展示不同文案。
- D6 不在 `client.ts` 增加类型层抽象，仅在 client 内部 try/catch 解析 `errJson?.error?.code`，throw 一个 `Error with code` 即可。

## 6. 待确认（D6 实施前与用户/架构对齐）

- 是否同意 D6 移除 `alert()` 全部路径（仅保留 `BackupPage.handleRestore` 的 `window.confirm`）？
- 是否同意 D6 增加 react-query `refetchInterval` 轮询，默认 5000ms？
- 是否同意 D6 修复 `PlanConfirmDialog` 的"未处理冲突 → apply 置灰"逻辑？
- 是否同意 D6 在没有 e2e 测试的情况下，仅靠"手动检查"验收？