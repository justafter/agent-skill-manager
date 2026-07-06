# D6 Web UI 首版闭环开发计划

本计划针对 M1/D6 阶段的 Web UI 工作，目标是让 Web 页面真实管理 Skill，而不是展示占位行。Web UI 所有写操作统一调本地 HTTP API，不直接访问文件系统；与 CLI、server 共用同一套核心能力。

## 涉及文件

- `web/src/App.tsx` - 路由与顶部导航
- `web/src/pages/SkillsPage.tsx` - Skill 列表、扫描、同步 plan/apply、确认弹窗；与 D3a/D3b 同步流程绑定
- `web/src/pages/ImportPage.tsx` - 导入页面，调 `/api/import`
- `web/src/pages/BackupPage.tsx` - 备份列表与还原二次确认
- `web/src/pages/ProjectSpacePage.tsx` - 项目空间（D7 实施后再细化）
- `web/src/components/SkillCard.tsx` - 单 Skill 行，多目标状态徽标 + 同步 / 拉回按钮
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
- `ImportPage`：当前用 `feedback` state 在表单内显示，成功与失败分别用绿底/红底。保留现有结构，但补上错误码展示（D5 中间件会返回 `{ error: { code, message } }`，UI 解析 `err` 中的 code 展示给用户）。

### 2.5 ProjectSpacePage 与 ProjectList 占位

- D6 阶段 ProjectSpacePage 保留占位（仅 `ProjectList(projects={[]})` 与一个无效"Add project"按钮），D7 实施时再补：
  - 项目列表接入 `GET /api/projects`。
  - 项目详情页接入 `POST /api/projects`、项目扫描、项目级 Skill 注入、规则同步。
- D6 在 ProjectSpacePage 顶部加一个明确的"D7 即将上线"提示，避免用户误以为功能缺失。

### 2.6 i18n 风格

- D6 阶段不引入 i18n 框架。
- 现有页面内出现中英文混用（SkillsPage 用中文 tabs，BackupPage 用英文）。D6 选择统一为中文（与 SkillsPage/ImportPage 当前风格一致）。
- 不在 D6 范围做完整翻译校对，仅修复明显不一致。

### 2.7 DiffView 与 RuleTemplateEditor

- 保持当前实现。`DiffView` 在 D6 仅在 console 或临时调试入口使用，不上正式 UI。
- `RuleTemplateEditor` 在 D8 实施时接入。

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