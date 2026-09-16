# 专业背诵手册交接文档

> 交接版本：`3fb36ce`
> 交接日期：2026-09-09
> 部署地址：请替换为你自己的 HTTPS 域名。
> 项目目录：以下示例使用 `/opt/kaoyan-study-console`

## 1. 当前状态

本次“专业背诵手册紧凑化与长期阅读优化”已经提交并推送到 `origin/main`，线上服务也已读取该版本。线上链路为：

```text
Nginx 80/443 → 127.0.0.1:8765 → kaoyan-study-console.service
                                └─ /opt/kaoyan-study-console/server.js
```

systemd 服务名为 `kaoyan-study-console.service`，运行用户是 `root`。仓库的 `.git` 和 `data/` 目录属于部署用户，日常 Git 操作需要 `sudo`。

## 2. 本次功能变更

- AI 默写改为约 44px 高的单行输入；Enter、Ctrl/Cmd+Enter 均可提交，保留中文输入法保护、按题草稿、重复提交保护和异步防串题。
- 评测结果默认显示分数、诊断和时间；扣分点、强化建议、记忆方法、本次复述收进“查看详细反馈”。
- 每题评测历史使用连续编号切换，默认选中最新一次，最多保留最近 20 次；淘汰旧记录后编号不重排。
- 删除专业手册页面上的掌握度自评区域和 1～5 分按钮。旧 `study.score` 数据继续保留以兼容旧状态，但不参与强化筛选或页面判断。
- “需强化”只看最新一次 AI 分数：`score < 6` 才标记；没有 AI 评测时不标记。
- “已背过”和背诵次数继续保留；达到既有高分条件时的背诵联动不变。
- 辅助记录改成按需展开的“本题笔记”和“内容报错”工具。报错原因不能为空，单题只保留最新一条，并记录更新时间和内容包哈希。
- 恢复真正的上一题/下一题移动，支持按钮、方向键和 J/K；移动遵循当前筛选顺序，首尾禁用，切题后同步 URL、阅读位置并滚动到题目顶部。
- 手册页面使用暖纸色、琥珀答案、沉静蓝 AI、鼠尾草绿已背和柔和砖红状态配色；移动端评测编号可横向滚动，输入与提交按钮保持同一行。

## 3. 关键文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 主界面、手册阅读器、事件分发、键盘操作和 `/api/state` 同步 |
| `manual45-reader.css` | 手册专用布局、暖色主题、评测卡、工具面板和响应式样式 |
| `manual45-content-core.js` | 手册内容状态标准化、评测历史、报错记录、背诵和统计核心 |
| `server.js` | 静态文件、状态读写及手册状态服务端标准化 |
| `manual45-content/content.json` | 本机导入的手册内容包（不进入版本控制） |
| `manual45-content/source.md` | 内容包导入后的原始 Markdown |
| `manual45-content/manifest.json` | 内容包版本、来源哈希、讲次和质量提示 |
| `manual45-content/assets/images/` | 内容包引用的本地图片资源 |
| `test/manual45-content.test.js` | 内容核心和数据兼容测试 |
| `test/manual45-server.test.js` | 服务端状态标准化和 API 测试 |

## 4. 数据结构与兼容规则

手册状态位于总状态的 `manual45Content` 下，并继续通过既有 `/api/state` 读写，不新增独立接口。新增/重点字段如下：

```js
manual45Content.recitationReviews[unitId] = {
  lastAttempt,
  lastResult,
  history: [{ attempt, result, updatedAt, attemptNumber }],
  totalAttempts,
  updatedAt
};

manual45Content.issueReports[unitId] = {
  reason,
  updatedAt,
  sourceHash
};
```

- `totalAttempts` 是累计评测次数；`history` 最多 20 条。
- 旧评测数据没有编号时，标准化会按原顺序补齐；旧的仅含 `lastAttempt/lastResult` 格式会转换为一条历史记录。
- `attemptNumber` 是稳定显示编号，不因历史淘汰重新从 1 开始。
- AI 分数按 0–10 保留一位小数；`lastResult` 无有效分数时不会用于强化判断。
- `issueReports` 只保存非空原因，原因最长 2000 字符；再次保存覆盖同一题旧记录。
- `study` 及旧 `progress[].score/note` 不删除，用于兼容历史状态；页面和统计忽略旧自评分数。
- 手册内容包更新后，报错记录中的 `sourceHash` 可用于识别报错对应的内容版本。

## 5. 日常维护与上线

在正式仓库执行检查：

```bash
cd /opt/kaoyan-study-console
env STUDY_ENV_PATH=/tmp/kaoyan-test-missing.env \
  STUDY_DATA_DIR=/tmp/kaoyan-test-data \
  node --test test/manual45-content.test.js test/manual45-server.test.js
node --check manual45-content-core.js
node --check server.js
git diff --check
```

提交时只暂存明确的源文件、测试、内容包和图片，不要把 `data/`、`deploy-backups/`、`.env`、`*.bak` 或 `*.before-*` 放进提交：

```bash
sudo git add index.html manual45-content-core.js manual45-reader.css server.js \
  test/manual45-content.test.js test/manual45-server.test.js \
  manual45-content/content.json manual45-content/manifest.json \
  manual45-content/source.md manual45-content/assets/images/*.jpg
sudo git commit -m "feat(manual45): <说明>"
sudo git push origin main
```

`index.html`、CSS 和内容资源由当前 Node 服务按请求提供，通常推送文件后即可生效；如果修改了 `server.js` 或环境变量，再执行：

```bash
sudo systemctl restart kaoyan-study-console.service
sudo systemctl status kaoyan-study-console.service --no-pager
```

## 6. 上线验收

至少检查本机和公网都能返回新页面：

```bash
curl -fsS http://127.0.0.1:8765/ -o /tmp/manual45-live.html
curl -fsS https://example.com/ -o /tmp/manual45-public.html
rg -n '查看详细反馈|manual45-select-attempt|data-manual-recitation|内容报错' \
  /tmp/manual45-live.html /tmp/manual45-public.html
curl -fsS https://example.com/manual45-reader.css -o /tmp/manual45-public.css
sha256sum manual45-reader.css /tmp/manual45-public.css
```

浏览器验收重点：

1. 连续评测 3 次后出现 `1 2 3`，默认打开第 3 次，切换编号能切换复述和反馈。
2. 第 21 次评测后历史显示 `2–21`，而不是重新显示 `1–20`。
3. 最新 AI 分数 5.9 进入“需强化”，6.0 退出；只有自评分时不进入。
4. 笔记和报错编辑器默认收起；报错首次保存、覆盖、刷新和服务端同步后仍存在。
5. 鼠标按钮、方向键和 J/K 均能按当前筛选顺序切题，首尾不能越界。
6. 在 1440、1024、390、360px 宽度检查输入行、评测编号和导航按钮无页面级横向溢出。

## 7. 回滚与数据安全

回滚代码优先使用可追踪的 `git revert`，不要使用 `git reset --hard`。回滚前先备份当前状态：

```bash
sudo cp data/state.json /tmp/manual45-state-before-rollback.json
sudo git revert 3fb36ce
sudo systemctl restart kaoyan-study-console.service
```

`data/state.json` 和 `data/backups/` 是运行时学习档案，不属于本次代码回滚范围。若只需恢复代码，不能用旧 Git 版本覆盖当前 `data/state.json`。任何状态恢复都应先停止服务、另存当前状态，并使用界面或明确的备份文件进行恢复。

## 8. 已知事项

- 本次定向手册/服务端测试共 13 项，全部通过。
- 完整 `npm test` 仍有 5 个与本次手册改动无关的既有页面基线失败（每日任务统计/任务区和响应式断言）；处理这些失败应单独开任务，不能通过回退手册改动解决。
- 当前部署目录存在历史 `deploy-backups/` 和运行时 `data/` 变更，属于现场文件，交接时不要清理或提交。
