# dsh-pet for Codex

在 Windows 上，把 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 接到本机 Codex：从桌宠提问、执行任务、查看进度、处理确认、接收回复，以及查询剩余用量。

这是一个本地适配项目。动画、拖拽、素材和桌面窗口由 dsh-pet 提供；模型推理与工具执行由已登录的 Codex 提供。无需另填 OpenAI API Key。

## 功能

| 入口 | 用途 |
| --- | --- |
| Codex → 显示虚拟宠物 | 启用自动监听后，启动桌宠和桥接；已运行时复用 |
| 桌宠 → 询问 Codex | 将输入交给持久的「DSH 桌宠」会话 |
| 桌宠 → Codex 控制台 | 完整回复、持续输出、任务输入、操作确认、补充问题 |
| 桌宠 → 查看剩余用量 | 实时读取账户额度，显示剩余百分比和北京时间重置时间 |
| 更多 → 停止 Codex 任务 | 取消由桌宠发起的当前任务 |
| 更多 → 打开 Codex 会话 | 在 Codex 中打开对应会话 |

桌宠同时观察本地其他 Codex 聊天的公开进度。不会把内部推理、用户原始输入或工具参数作为进度气泡显示。

## 环境要求

- Windows 10/11；PowerShell 5.1 或更新版本。
- Node.js **22.12.0+**，建议 Node.js 24；`node`、`npm` 可从终端运行。
- 已安装并登录的 Codex CLI：`codex login status` 能返回登录状态。
- 使用「显示虚拟宠物」自动联动时，还需运行 Codex 桌面应用。
- dsh-pet **0.3.8**。未安装时，安装脚本从 npm 安装这一已联调版本。

本项目没有 npm 运行依赖，不包含宠物视频素材或 Electron 安装包。dsh-pet 首次启动可能下载其桌面运行时。

## 安装

```powershell
git clone https://github.com/zonglin03/dsh_pet_for_codex.git
cd dsh_pet_for_codex
codex login status
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -AutoStart
```

也可以下载仓库 ZIP，解压到固定目录后双击 `install.cmd`。这种方式只安装并启动；需要登录后自动监听时，再双击 `enable-auto.cmd`。

安装脚本会：

1. 检查 Node.js 与 Codex，必要时安装 `dsh-pet@0.3.8`。
2. 启动 dsh-pet 与本地桥接服务。
3. 备份并调整 dsh-pet 原生菜单，把对话接到本地 Codex 网关。
4. 关闭自动 AI 碎碎念；保留用户手动点播入口。
5. 指定 `-AutoStart` 时，在当前用户「启动」文件夹添加隐藏监听器。

`ExecutionPolicy Bypass` 只作用于该次 PowerShell 进程，不会修改系统执行策略。

### 设置工作目录

默认在仓库的 `workspace/` 中工作，此目录不进入版本控制。可以在首次安装时指定：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -AutoStart -Workspace 'D:\Projects\my-app'
```

已有会话时不会覆盖其工作目录。请在控制台展开「工作目录与新对话」，输入绝对路径，开始新对话；原对话仍保留在 Codex 历史中。

## 使用

1. 点击 Codex 的「显示虚拟宠物」，或双击 `start.cmd`。
2. 右键桌宠 → **询问 Codex**，输入任务。
3. 输入框先显示任务已交给 Codex；后续进度与结果通过桌宠气泡返回。
4. 打开 **Codex 控制台** 查看完整回复、继续提问，或处理待确认操作。
5. 完成后继续使用同一会话；桥接重启后会恢复会话和历史。

控制台中 `Enter` 换行，`Ctrl+Enter` 发送。需要命令或文件审批时，先查看请求与改动，再选择允许本次、拒绝或取消。其他扩展工具的特殊请求可手动填写响应 JSON，或停止任务。

**剩余用量 = 100 − 已用百分比**，不是余额金额、剩余 token 或剩余请求次数。查询优先使用 Codex 实时接口；失败时明确标注本地历史数据及更新时间。

## 常用命令

| 文件 | 行为 |
| --- | --- |
| `install.cmd` | 检查前置条件、安装并接入 |
| `start.cmd` | 启动桌宠与桥接 |
| `stop.cmd` | 停止桥接，保留独立桌宠服务 |
| `enable-auto.cmd` | 启用隐藏监听器及当前用户登录启动 |
| `disable-auto.cmd` | 停止监听器并取消其登录启动，保留当前桌宠及桥接 |
| `uninstall.cmd` | 停止联动与服务，利用本地备份恢复原菜单、AI 配置 |

停止桥接或卸载前，先通过控制台停止正在运行的任务。卸载不会删除源码、对话历史、工作文件或上游 npm 包。

## 连接方式与权限

```text
Codex 桌面开关 ── 本地状态监听 ── 启动 dsh-pet + bridge
桌宠对话 ── 本地兼容网关 ── codex app-server ── 已登录账户
                                 │
                 实时进度 / 回复 / 审批 / 用量
                                 │
                         桌宠气泡 + 控制台
```

- 桌宠任务使用独立持久会话，默认 `workspace-write` 沙箱、`on-request` 审批，审批人是用户。
- 不自动批准确认，不关闭 Codex 管理策略，不修改全局模型配置。
- `codex-local` 是 dsh-pet 中的路由名称；实际模型沿用 Codex 配置。
- 控制台与网关默认只监听 `127.0.0.1:3081`，使用本机访问令牌。
- dsh-pet 端口与令牌读取自其独立服务运行文件，不硬编码账户信息。
- 任务仍需要 Codex 联网，模型和工具使用计入该账户用量。

## 数据与隐私

| 路径 | 内容 |
| --- | --- |
| `.runtime/` | 本机网关令牌、会话 ID、进程文件和日志 |
| `backups/` | 安装前的 dsh-pet 菜单源码备份 |
| `workspace/` | 默认工作区 |
| `~/.dsh/dsh-pet/standalone-ai.before-codex.json` | 原 AI 配置备份，可能包含原服务商凭据 |
| `~/.codex/sessions/` | 由 Codex 管理的本地聊天记录 |

前三个目录已被 `.gitignore` 排除。不要公开分享运行令牌、原 AI 配置备份或会话记录。仓库只发布适配源码、文档与无账户依赖的测试。

## 更新与卸载

更新本项目：先停止桥接，拉取新代码，再运行 `install.cmd`。dsh-pet 更新可能覆盖菜单修改；重新运行安装即可应用适配，原备份会保留。

需要恢复原始 dsh-pet：运行 `uninstall.cmd`。有原 AI 配置备份时恢复它；没有备份时关闭本项目的 AI 路由。上游包和本地数据仍保留，之后可单独启动 dsh-pet。

## 排错

| 现象 | 检查方法 |
| --- | --- |
| 找不到 `codex` | 安装 Codex CLI，重新打开终端，运行 `codex login status` |
| 点击开关没有反应 | 先运行 `enable-auto.cmd`；查看 `.runtime/auto.log` 和 `auto-error.log` |
| 桌宠未出现 | 查看 `.runtime/pet.log`；检查 dsh-pet 显示位置是否包含 desktop |
| 提示端口占用 | 保留一份桥接实例；检查 3081 端口是否被其他程序使用 |
| 控制台提示需要令牌 | 从桌宠右键菜单重新打开，不要手工输入只有端口的 URL |
| 任务正在重连 | 在控制台查看连接状态；必要时停止后重试，勿重复提交相同文件操作 |
| 菜单恢复成原版 | dsh-pet 更新覆盖了适配，重新运行 `install.cmd` |
| 原生对话先返回“已交给 Codex” | 正常行为；任务继续运行，结果在气泡与控制台显示 |

更多实现、版本与环境变量见 [架构说明](docs/architecture.md)。

## 验证与开发

```powershell
npm run check
npm test
```

检查不需要账户，不发起模型请求。CI 在 Windows / Node.js 24 上运行相同检查。

本机端到端联调已覆盖：原生桌宠输入 → Codex 真实回复、工作区文件创建、任务停止、桥接重启后的历史恢复、实时额度查询。命令/文件审批界面已实现；没有为测试自动批准真实操作。

## 当前边界

- 支持本机 Windows，尚未验证 macOS/Linux。
- dsh-pet 以独立桌面进程运行，不替换 Codex 内置宠物；隐藏内置宠物不会强制关闭 dsh-pet。
- 开关联动和其他聊天的状态观察依赖当前桌面客户端的本地状态与 JSONL 格式，升级后可能需要适配。
- 不提供远程主机所有聊天的实时订阅，不会自动向其他聊天追加消息。

## 致谢与许可

适配代码使用 [MIT License](LICENSE)。dsh-pet 是独立上游项目，其动画、素材、运行时及依赖遵循上游许可。本仓库不分发这些资源，也不是 OpenAI 或 dsh-pet 官方项目。

- [dsh-pet 上游](https://github.com/PC2005-cloud/dsh-pet)
- [Codex App Server 文档](https://learn.chatgpt.com/docs/app-server)
- [第三方说明](THIRD_PARTY_NOTICES.md)
