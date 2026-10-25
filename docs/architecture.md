# 架构与维护

## 文件分工

| 文件 | 职责 |
| --- | --- |
| `auto-bridge.mjs` | 检查 Codex 进程及 `electron-avatar-overlay-open` 开关，调用启动脚本 |
| `start.ps1` | 启动或复用 dsh-pet 独立服务及桥接 |
| `bridge.mjs` | 观察本地 JSONL、映射公开进度、注册菜单、维护气泡与工作状态 |
| `codex-client.mjs` | 通过 stdio 与本机 Codex app-server 交换 JSON-RPC 消息 |
| `gateway.mjs` | 管理持久会话、任务、实时事件、用量、访问令牌和 HTTP API |
| `console.html` | 同源控制台，显示完整回复与审批、提交任务或答案 |
| `install-codex.mjs` | 备份原配置，将 dsh-pet 原生对话指向兼容网关并调整菜单 |

桥接启动时只启动本地服务；第一次发送桌宠任务时才建立其持久会话。用量查询会连接 app-server，但不会创建对话或调用模型。

## 联调版本

- Windows，Node.js 24.18.0。
- dsh-pet 0.3.8。
- Codex CLI 0.163.0-alpha.11.1，桌面发行版 26.1016.8120.0。

这是联调环境记录，不表示这些版本之外一定兼容。安装器固定 dsh-pet 版本；Codex 沿用用户本机安装。

## 环境变量

| 变量 | 默认值 / 用途 |
| --- | --- |
| `CODEX_PET_SESSIONS` | `~/.codex/sessions`，本地日志来源 |
| `CODEX_PET_RUNTIME` | `~/.dsh/dsh-pet/standalone-runtime.json`，桥接 HTTP 请求运行文件 |
| `CODEX_PET_ID` | `main`，日志进度及用量气泡的默认宠物 |
| `CODEX_PET_STATE_FILE` | `~/.codex/.codex-global-state.json`，头像开关状态 |
| `CODEX_PET_CODEX` | `codex.exe`，app-server 可执行文件 |
| `CODEX_PET_GATEWAY_PORT` | `3081`，本地网关端口 |
| `CODEX_PET_WORKSPACE` | 仓库下 `workspace/`，新建默认会话工作目录 |
| `CODEX_PET_DSH_ROOT` | 启动脚本查找 dsh-pet 包时的显式路径 |

设置端口后需重新运行 `install-codex.mjs` 更新 dsh-pet 路由。会话已有工作目录时，修改默认目录变量不会覆盖历史。安装和菜单适配按默认 DSH home 与 `main` 宠物联调；自定义环境变量不代表多宠物或自定义 home 的所有路径已验证。

## 本地 HTTP API

所有 `/api/*` 和 `/v1/chat/completions` 请求需要 `Authorization: Bearer <本机网关令牌>`，不能使用 OpenAI API Key 替代。接口只绑定回环地址，不应代理到公网。

| 方法与路径 | 用途 |
| --- | --- |
| `GET /` | 静态控制台 |
| `GET /api/state` | 当前任务、公开消息、待确认请求与目录 |
| `POST /api/send` | `{text}` 提交桌宠任务 |
| `POST /api/stop` | 停止当前桌宠任务 |
| `POST /api/usage` | 查询实时用量，并通过气泡显示 |
| `POST /api/reply` | `{id,result}` 回答对应的待确认请求 |
| `POST /api/new` | `{cwd}` 为后续新对话选择目录，不会立即创建聊天 |
| `POST /v1/chat/completions` | 接收 dsh-pet 的原生对话请求，返回任务受理 SSE |

兼容网关不是通用 OpenAI 代理：它接受输入并启动持久 Codex 任务，随后通过 app-server 事件与桌宠 API 显示结果。它不会转发 dsh-pet 的系统角色设定、完整历史或配图提示；会话记忆由 Codex 自身提供。

## 状态与恢复

其他本地聊天：启动时选取最近 20 个 JSONL 并从末尾观察，之后发现新文件；不回放已有进度。持续无新事件时回空闲。桌宠自己发起的任务优先显示，避免其他聊天覆盖它的工作状态。

原生菜单修改属于上游源码适配，更新可能覆盖；原始 `sprite.js` 保存在忽略的 `backups/` 中。AI 配置备份留在 DSH home，并限制为当前用户。发布时不复制运行目录和配置备份。

当前控制台直接支持命令审批、文件审批、补充问答。其他 app-server 扩展请求保留原始参数供用户手动回答，不做自动授权。网络重连提示会在任务成功后清除。
