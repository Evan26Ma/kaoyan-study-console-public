# 考研学习中控台

一个可本地部署的考研学习管理工具，用于每日任务、阶段规划、背诵复习、错题复盘、英语阅读和 AI 辅助整理。

## 功能

- 每日任务、作息安排与长期规划
- 背诵进度、复习排程和默写评测
- 错题录入、复盘、导出与 AI 分析
- 英语阅读成绩、错因和词汇复习
- 本地 JSON 持久化及自动备份
- 兼容 OpenAI API 格式的文本与图像服务

## 快速启动

需要 Node.js 18 或更高版本。

```bash
cp .env.example .env
# 编辑 .env，至少设置一个不可猜测的 ACCESS_TOKEN
npm start
```

默认访问地址为 `http://127.0.0.1:8765/`。未配置 `ACCESS_TOKEN` 时服务保持只读。

## 私有数据

所有运行时学习状态、备份、生成图片、可信设备记录和第三方登录状态都保存在 `data/`，该目录整体被 Git 忽略。不要把它添加到提交、Issue 或公开附件中。

`.env` 包含访问令牌和 AI 服务密钥，也被 Git 忽略。仓库只提供不含真实凭据的 `.env.example`。

## 本地背诵材料

仓库不分发第三方学习材料。页面在本机尚未导入内容时使用 `examples/manual45-content/content.json` 中的匿名示例。

导入自有 Markdown 材料：

```bash
npm run import:manual45 -- /path/to/your-material.md
```

生成的 `manual45-content/` 只保存在本机并被 Git 忽略。请确保你拥有所导入内容及图片的使用权。

## 配置与部署

`.env.example` 列出了访问控制、AI 提供商、第三方错题服务以及监听地址等配置。Linux 部署示例见 `README-LINUX.md`。

若监听 `0.0.0.0` 或部署到公网，请同时启用 HTTPS、VPN、反向代理认证或同等级的外围访问控制。本项目是单用户工具，不提供多用户数据隔离。

## 测试

```bash
npm test
```

## License

项目自有代码采用 [MIT License](LICENSE)。`vendor/` 中的第三方依赖遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
