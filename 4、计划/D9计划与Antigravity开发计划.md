# D9 Watch Mode 与 Antigravity 开发计划

本计划针对 M1/D9 阶段的"运行时监听/扫描 + 增强适配"工作，涵盖三块：

1. **Skill Watch Mode**：监听开发者编辑过的 Skill `localPath`，变化时自动 plan/apply 到已配置目标。
2. **Rule 跨 Agent 变化检测（D9 变更：手动扫描模式）**：通过手动点按扫描，即时比对项目级 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` 与本地模板的差异，**只检测 + 提示用户**，不自动写入。
3. **Antigravity 路径与状态对齐**：按官方约定固化 `~/.gemini/config/skills/` 用户级路径；首版不再生成 `~/.gemini/antigravity-ide/plugins/...` 旧插件路径与 `plugin.json`。

> 第 2 块（D9 §2.3 Rule 变化检测）在设计上**只检测 + 提示，不自动写入**——避免监听器误覆盖用户内容；写入路径仍走 §3e / §3e.2 的手动按钮。采用手动点按单次扫描模式，避免长时间后台监听带来的 CPU 及 IO 性能开销。

## 涉及文件

- `src/cli/watch.ts` - CLI `asm watch` 命令组
- `src/server/routes/rules-watch.ts` - 规则扫描 API (GET /status, POST /scan, POST /clear)
- `src/server/routes/rule-template-dir.ts` - **新增**，Rule 模板目录 GET/PUT；RulesPage 顶部"切换模板目录"使用
- `src/core/watch.ts` - 技能监听 (chokidar) 与 规则扫描 (on-demand scan)
- `src/rules/plan.ts` - 规则计划核心；接受可选 `templateDir` 参数
- `src/rules/apply.ts` - 规则应用核心；接受可选 `templateDir` 参数
- `src/utils/pidfile.ts` - CLI 后台进程的 PID 文件
- `src/adapters/gemini-antigravity.ts` - Antigravity 适配器
- `web/src/pages/SkillsPage.tsx` - Skill 列表页 watch 切换按钮
- `web/src/pages/RulesPage.tsx` - Rule 模板库页"扫描项目规则文件变化"控制面板 + 顶部变更横幅 + 切换模板目录按钮

---

## 1. 设计原则

- **Watch 默认全部关闭**。任何 watch 行为都必须由用户在 UI 或 CLI 显式开启。
- **Skill Watch 允许自动 apply**（基于已确认的目标），**Rule Scan 严禁自动 apply**。Rule 扫描只刷新差异结果 + 提示用户。
- **防抖**：Skill watch 触发必须经过防抖（默认 800ms），避免编辑器保存时的多次事件抖动产生重复 plan。
- **失败写入 watch error log**，不中断 watch 进程。
- **PID 文件**：CLI 后台运行 watch 时写 PID 文件，方便 stop / 状态查询。
- **Antigravity 加载状态**：UI 显示三态——"路径已写入 / 加载已验证 / 加载未验证"。首版"加载验证"用 Antigravity 是否能读到 `~/.gemini/config/skills/<skill>` 目录作为代理判定。
- **Rule 模板目录可配置**（D9 增补）：D8 的 `planRuleSync` / `applyRuleSync` 与 `RulesPage` 不再硬编码 `<root>/library/rules`，模板根目录统一从 `config.ruleTemplateDir` 解析；未配置时返回 `CONFIG_MISSING` 错误并要求先在 UI 里"切换模板目录"。RulesPage 顶部 toolbar 增加"切换模板目录…"按钮（弹 modal，复用 `<DirectoryPicker>`），后端 `PUT /api/config/rule-template-dir` 持久化到 `~/.skill-manager/config.json` 并自动 mkdir 不存在的目录。这样既兼容"在仓库 `library/rules` 里手写"的场景，也允许用户把模板目录放到任意绝对路径。

---

## 2. 拟实施工作项

### 2.1 Skill Watch Mode

- **CLI**：`asm watch <skill-name> --target <targets>` 启动 chokidar 监听，监听 Skill 的 `localPath` 下 `SKILL.md` / `scripts/` / `references/` / `assets/` 的增删改。
- **触发**：防抖后自动调 `planProjectSkillInject` 或 `sync/plan` 生成 plan，再调 `apply` 写入。
- **配置开关**：每个 Skill 单独持有一个 `watch: boolean`，由 UI toggle 控制。
- **失败容错**：写入失败时把错误写入 `~/.skill-manager/logs/watch-error.log`。
- **PID 文件**：`~/.skill-manager/run/watch-skill-<skillName>.pid`；CLI 启停时清理。
- **Antigravity 用户级写入**：写入 `~/.gemini/config/skills/<skill-name>/`（首版**不再**生成 `plugin.json`）。

### 2.2 Antigravity 状态展示

- 适配器 `detect()` 已存在；D9 阶段在 UI 增加"加载已验证 / 加载未验证"二态指示：
  - 路径已写入（`detect() === true` 且 `scanUserSkills()` 能找到 Skill）→ "已写入"
  - 路径写入但加载未验证 → "加载未验证"（带 tooltip 提示"建议重启 Antigravity 或运行 asm doctor"）
  - 路径不存在 → "未配置"（默认状态）

### 2.3 Rule 跨 Agent 变化检测（D9 变更：手动扫描模式）

- **入口**：在 `RulesPage.tsx` 底部新增一个控制面板“**扫描项目规则文件变化（仅检测）**”，提供“🔍 执行规则扫描”按钮。
- **点按行为**：
  - 调用后台接口一键对所有已注册项目下的 `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`进行单次扫描。
  - 检测到差异（`block` 或 `conflict`）时，在 RulesPage 顶部以 Toast/Banner 横幅形式展示变更提示。
  - 横幅提供“查看 Diff”、“同步到模板 (Pull) ↓”、“推送覆盖 (Push) ↑”和“忽略”操作。
  - **写入动作必须由用户手动点击按钮触发**。
- **API**（新增/更新）：
  - `POST /api/rules/watch/scan` - 一键扫描项目规则文件，返回并记录变更
  - `GET /api/rules/watch/status` - 获取当前扫描出的变更状态
  - `POST /api/rules/watch/clear` - 清空当前变更提示
- **防抖**：扫描直接利用现有的 `planRuleSync` 进行比对。

---

## 3. 验收口径

### 3.1 自动化测试

在 `tests/integration/watch.test.ts` 中完成：
- Skill watch 启动后，模拟 Skill `localPath` 下文件变更 → 防抖 → 自动 plan → apply 成功。
- Skill watch 启动后，apply 失败 → 错误写入 logger，进程不退出。
- Rule scan 触发后，模拟 `<project>/CLAUDE.md` 差异 → 正确返回变更记录；`applyRuleSync` 计数为 0。

### 3.2 手动检查

- **Skill Watch**：
  - `asm watch ep-android-development --target claude:user` 启动并写入 PID。
  - 修改 `SKILL.md` → 800ms 后自动 sync。
- **Rule Scan**：
  - 在 RulesPage 点击“🔍 执行规则扫描”按钮。
  - 修改项目内规则文件，再次点击“执行规则扫描”，页面顶部显示变更提示，点击“查看 Diff”平滑滚动至对应行并高亮。
