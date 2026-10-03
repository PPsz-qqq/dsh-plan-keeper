# 计划保留与继续执行 · dsh-plan-keeper

适用版本：DeepSeek Harness 0.2.0-rc.2。

## 功能

- 输入框上方持续显示 AI 使用 `todo_write` 制定的执行计划。
- 新轮次、执行报错、用户停止、输出达到上限后，仍保留原步骤和完成状态。
- 刷新页面、重新打开会话或重启 DSH 后，从该会话的持久记录恢复计划。
- 会话空闲且有未完成步骤时，可点击 **继续执行**，向同一个会话提交继续指令及原计划。
- 运行中禁用按钮；发送失败可重试；不会清空输入草稿，不会自动重试或修改权限。
- AI 写入新计划时替换旧计划，写入空列表时清空。已完成的计划保留展示，不显示继续按钮。

## 安装

在 DSH 的「插件」页面填写安装包网址：

```text
https://github.com/PPsz-qqq/dsh-plan-keeper/releases/download/v0.1.0/dsh-plan-keeper-0.1.0.tgz
```

也可从 [Releases](https://github.com/PPsz-qqq/dsh-plan-keeper/releases/latest) 下载安装包，再填写本地安装包绝对路径。

当前桌面配置安装后需要重启 DSH，再重新打开会话；仅刷新页面不足以使 Host 插件生效。

本地开发目录可使用 `file:` 安装。不要只填写裸目录路径：某些 pnpm 配置会将它作为 `link:` 链接，不安装该目录的依赖，造成宿主加载失败。

关闭插件后，恢复 DSH 内置的待办栏，不更改任何历史计划记录。

## 说明与边界

“暂停”表示会话当前未运行且计划有未完成项；不代表插件修改了 Agent 的运行状态。继续按钮启动一个新轮次，不是恢复已经消失的进程。

计划恢复读取最近一次 `todo/write`，不会被 `turn/start` 清空。所有步骤状态仍由 AI 的 `todo_write` 更新。本插件不解析普通聊天文字里的计划或 Plan Mode 的 Markdown 审批文档。

如果 AI 已主动写入新计划或空列表，旧计划不会被强行复活。若原始会话记录已被删除，则不能恢复。

继续指令尊重当前权限、审批和安全限制；不能修复网络、额度、登录或服务故障。请先解决相应阻碍，再点击继续。

单次委派和子代理会话不提供可用的继续按钮；请在主会话使用。

## 开发

Host 半侧注册独立的 `planKeeper` 会话投影；Client 半侧替换 `conversation.input.dock` 的 `todo` 单元。卸载会自动清理投影、样式和界面注册。

```powershell
node --test tests/*.test.mjs
node --check index.js
node --check client.js
```

客户端产物已经是可加载的 ModuleLoader bundle，不需要额外构建，不包含安装脚本。
