# D5 Server API 开发计划

本计划针对 M1/D5 阶段的 Server API 工作，目标是把 CLI 已经跑通的同步、备份、导入、扫描能力暴露为本地 HTTP 接口，让 Web UI、CLI 与外部脚本共用同一套核心写入逻辑；并在 server 层引入统一错误响应、参数校验与请求日志，作为后续 Web UI 与第三方接入的稳定边界。

## 涉及文件

- `src/server/app.ts` - 装配中间件与路由
- `src/server/index.ts` - 进程入口与启动日志
- `src/server/middleware/errors.ts` - 新增全局错误处理中间件（AppError → 统一响应体）
- `src/server/middleware/validation.ts` - 新增 zod schema 校验中间件
- `src/server/routes/*.ts` - 已有 11 个路由文件，逐一接入错误中间件，按需补 zod
- `src/server/schemas/*.ts` - 新增各路由的 zod schema（按需分文件，不强制单文件）
- `tests/integration/api.test.ts` - 新增 server 端集成测试

## 1. 设计原则

- **不重复核心写入逻辑**：server 路由只做"读取 HTTP body、调核心能力、把结果序列化"。所有 plan/apply、backup/restore、import 的写入逻辑必须落在 `src/core`、`src/sync`、`src/backup` 等共享模块。
- **plan/apply 协议**：所有写接口必须严格走"先 `/plan`、再 `/apply`"两步。apply 只接受 `planId`，不接受临时目标，避免 UI 展示内容与执行内容不一致。
- **错误响应统一**：所有错误统一形如 `{ error: { code, message, details? } }`，`code` 取自 `AppError.code`。
- **入参校验前置**：所有写接口做 zod schema 校验；校验失败返回 400 与结构化错误。
- **路径安全**：所有写接口在路由层不再做白名单校验，由核心能力的 `assertSafeWritePath` 统一把守（与 D3a / D3b / D4 文档一致）。

## 2. 全局错误处理中间件

### 2.1 实现

在 `src/server/middleware/errors.ts` 实现 `errorHandler(err, req, res, next)`：

- 检测 `err instanceof AppError`：
  - 已知错误码（如 `PATH_OUT_OF_BOUNDS` / `BACKUP_FAILED` / `PLAN_NOT_FOUND` / `SKILL_NOT_FOUND` 等）→ 返回对应 HTTP 状态码：
    - `PATH_OUT_OF_BOUNDS` → 403
    - `BACKUP_NOT_FOUND` / `SKILL_NOT_FOUND` / `PLAN_NOT_FOUND` / `PLAN_ALREADY_EXECUTED` / `SKILL_SOURCE_MISSING` → 404
    - `INVALID_TARGET_KEY` / `INVALID_TARGET_AGENT` / `UNSUPPORTED_SCOPE` / `TARGET_REFUSED` / `INCONSISTENT_OPTIONS` / `AGENT_DISABLED` / `PULL_VALIDATION_FAILED` → 400
    - `BACKUP_FAILED` / `REGISTRY_SAVE_FAILED` / `REGISTRY_LOAD_FAILED` / `CONFIG_LOAD_FAILED` / `CONFIG_VALIDATION_FAILED` → 500
    - 其余 AppError → 500
  - 响应体：`{ error: { code, message, details } }`，`status` 按上表映射。
- 其他未知错误 → 500，响应体 `{ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }`，原始错误写入 server 日志（不暴露给客户端）。

### 2.2 接入

- 在 `src/server/app.ts` 装配中间件顺序：
  1. `express.json()` body parser。
  2. 路由挂载（11 个 router）。
  3. `errorHandler` 兜底（必须最后）。
- 路由内不再调用 `next(error)` 以外的错误返回；改用 `throw new AppError(...)` 让中间件统一处理。
- 各路由内现有的 `res.status(4xx).json({ error: '...' })` 临时返回需逐步替换为 `throw new AppError(...)`。

## 3. 入参校验（zod）

### 3.1 强制接入的写接口

- `POST /api/sync/plan`：body `{ skillName: string; from?: TargetKey; targets?: TargetKey[]; allowManagedModify?: boolean }`。
- `POST /api/sync/apply`：body `{ planId: PlanId; allowManagedModify?: boolean }`。
- `POST /api/import`：body `{ path: string; force?: boolean; skip?: boolean }`。
- `POST /api/backups`：body `{ skillName?: string; reason?: string }`。
- `POST /api/restore`：body `{ backupId: string }`。
- `POST /api/scan`：body 可空。

### 3.2 实现

在 `src/server/middleware/validation.ts` 提供 `validateBody(schema)` 高阶函数，返回 express middleware；校验失败时抛 `AppError('VALIDATION_ERROR', '...', zodError.flatten())`。

### 3.3 不强制接入的接口

- `GET /api/health`、`GET /api/config`、`GET /api/backups`、`GET /api/skills`、`GET /api/diff`：只读接口，参数校验在路由内部用 `String()` 处理即可，不需要 zod。
- `POST /api/watch/start`、`POST /api/watch/stop`：D9 阶段再补。

## 4. 路由清单与现状

| 路由                                  | 方法     | 实现状态         | D5 待办                                                                                   |
| ------------------------------------- | -------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `/api/health`                         | GET      | ✅               | 无                                                                                        |
| `/api/config`                         | GET      | ✅               | 接入错误中间件；`PUT /api/config` 可选补                                                  |
| `/api/skills`                         | GET      | ✅               | 接入错误中间件；返回结构与首版需求一致                                                    |
| `/api/scan`                           | POST     | ✅               | 接入错误中间件；可选加 zod                                                                |
| `/api/import`                         | POST     | ✅               | 接入错误中间件 + zod                                                                      |
| `/api/sync/plan`                      | POST     | ⚠️ 未透传 `from` | 加 `from` 字段 + zod                                                                      |
| `/api/sync/apply`                     | POST     | ✅               | 接入错误中间件 + zod                                                                      |
| `/api/diff`                           | GET      | ✅ 双语义        | 接入错误中间件；可选拆分两个端点                                                          |
| `/api/backups`                        | GET/POST | ✅               | 接入错误中间件；POST 加 zod                                                               |
| `/api/restore`                        | POST     | ✅               | 接入错误中间件 + zod                                                                      |
| `/api/watch/start`、`/api/watch/stop` | POST     | ⚠️ 501           | D9 范围，D5 不动                                                                          |
| `/api/projects`                       | GET      | ⚠️ 仅返回空数组  | D7 范围；D5 把硬编码空数组改为从 `loadConfig().projects` 读取，避免 D7 实施时出现两套路径 |

## 5. CLI 与 server 一致性

- server 路由的所有 plan/apply 调用必须复用 `src/sync/engine.ts` 等核心函数，**不允许在路由内重新计算 checksum / 重新调用 `copyDirectory`**。
- 同一 Skill 同一参数调用 CLI 与 server 时，plan summary 必须一致。`tests/integration/api.test.ts` 必须覆盖该断言。

## 6. 验证机制

### 自动化测试

`tests/integration/api.test.ts` 新增：

1. **统一错误响应**：调用 `/api/restore` 不带 `backupId` → 400 + `{ error: { code: 'VALIDATION_ERROR', message, details } }`。
2. **未知 AppError → 对应 HTTP 状态**：调用 `/api/sync/apply` 不存在的 `planId` → 404 + `{ error: { code: 'PLAN_NOT_FOUND' } }`。
3. **未知异常 → 500 + 脱敏**：手动注入非 AppError 错误时，响应体不含原始堆栈。
4. **CLI/server 一致性**：同一 Skill 同一参数，CLI `planSync` 返回与 server `POST /api/sync/plan` 返回的 `summary` 与 `items` 完全一致。
5. **`from` 透传**：`POST /api/sync/plan { skillName, from: 'claude:user' }` 应触发反向拉取 plan（依赖 D3b 已实施的核心层）。
6. **错误中间件位于路由之后**：路由内手工 `throw new AppError` 仍能被中间件捕获并返回结构化响应。
7. **zod 校验失败**：body 缺字段时返回 400 + `code: 'VALIDATION_ERROR'`。

执行：

- `pnpm run typecheck`
- `pnpm run test`

### 手动检查

- 启动 server：`pnpm dev:server`。
- 用 `curl` 触发已知错误与未知错误，确认响应体一致。
- Web UI 操作 plan/apply，确认错误 toast（依赖 D6 实施）能展示 `code` 与 `message`。

## 7. 风险与待确认

- **错误码 → HTTP 状态映射表**：当前 D5 给出初步映射，落地时若有遗漏的 `AppError` 应统一兜底为 500。`AppError` 新增错误码时需同步更新映射表。
- **`/api/diff` 双语义**：当前 GET 同时支持文本 diff（`?before=&after=`）和目录 diff（`?skill=&target=`），通过 query 参数有无触发分支。维护成本低但调用方容易踩坑。D5 不强制拆分，但建议在 D6 接入时显式约束调用。
- **zod 错误体大小**：zod 默认会把所有字段错误都铺平输出，可能泄漏内部路径。`validateBody` 中间件应只返回 `flatten()` 而非完整 `zodError`，避免响应体膨胀。
- **`/api/projects` 改造**：把硬编码空数组改为从 `loadConfig().projects` 读取，行为变化很小但需要 `tests/integration/projects-empty.test.ts` 之类的断言。`loadConfig().projects` 与 D7 实施的"运行时新增/删除项目"应共用同一个数据源，建议在 `core/projects/registry.ts` 抽函数 `listProjects(config)`（D7 实施时再做）。
- **server 与 CLI 的 cwd 假设**：所有路由 `loadConfig()` 不传 `root`，依赖 `process.cwd()` 落在仓库根。`pnpm dev:server` 当前已满足；后续若支持"任意目录启动"，需在路由入口加 `root` 解析逻辑。
