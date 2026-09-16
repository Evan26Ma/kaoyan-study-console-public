# 考研复习中控台 Linux 部署

## 运行要求

- Node.js 18 或更高版本
- 一个可写目录，用于保存 `.env`
- 浏览器访问端口，默认 `8765`

## 快速启动

```bash
tar -xzf kaoyan-study-console-linux.tar.gz
cd kaoyan-study-console-linux
chmod +x start.sh
./start.sh
```

访问：

```text
http://服务器IP:8765/
```

## 配置 DeepSeek

启动后进入网页左侧的“设置”页，填写：

- API Key
- 模型名，例如 `deepseek-v4-flash`
- Base URL，默认 `https://api.deepseek.com`

配置会保存到服务端目录下的 `.env`，不会写入浏览器 localStorage。

也可以直接编辑 `.env`：

```bash
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
HOST=0.0.0.0
PORT=8765
DEEPSEEK_MAX_TOKENS=6000
```

修改 `HOST` 或 `PORT` 后需要重启服务。

## systemd 示例

把下面内容保存为 `/etc/systemd/system/kaoyan-study-console.service`，并把 `WorkingDirectory` 改成实际目录：

```ini
[Unit]
Description=Kaoyan Study Console
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/kaoyan-study-console-linux
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=HOST=0.0.0.0
Environment=PORT=8765

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kaoyan-study-console
```

## 安全提醒

这是个人学习工具。若部署到公网，建议放在内网、VPN、Nginx Basic Auth 或其他访问控制之后，避免陌生人访问设置页。
