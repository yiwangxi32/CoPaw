# CoPaw

CoPaw 是一个企业级 AI 聊天应用，提供专业的对话界面、知识库管理和多模型支持能力。

## 🚀 功能特性

- **专业对话界面** - 支持流式响应、Markdown 渲染、代码高亮
- **知识库管理** - 支持文件和文件夹上传，构建企业知识库
- **多模型支持** - 兼容 OpenAI API 和 Ollama 本地模型
- **用户认证** - JWT 安全认证，支持多用户管理
- **会话管理** - 聊天历史持久化，支持会话切换
- **模型配置** - 灵活的模型参数配置和连接管理

## 🛠️ 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端 | FastAPI | 最新 |
| 前端 | React + TypeScript | 最新 |
| 构建工具 | Vite | 最新 |
| 数据库 | SQLite | 内置 |
| 认证 | JWT | PyJWT |
| AI 接口 | OpenAI Compat / Ollama | - |

## 📁 项目结构

```
CoPaw/
├── web/
│   ├── backend/              # FastAPI 后端
│   │   ├── app/              # 应用代码
│   │   │   ├── auth/         # 认证模块
│   │   │   ├── db/           # 数据库配置
│   │   │   ├── routers/      # API 路由
│   │   │   ├── models/       # 数据模型
│   │   │   ├── providers/    # AI 提供商
│   │   │   └── main.py       # 应用入口
│   │   ├── .env.example      # 环境变量模板
│   │   └── requirements.txt  # Python 依赖
│   ├── src/                  # React 前端
│   │   ├── lib/              # 工具函数和 API
│   │   ├── ui/               # 组件
│   │   └── main.tsx          # 前端入口
│   ├── .env.example          # 前端环境变量
│   └── package.json          # Node.js 依赖
├── run-dev.ps1               # Windows 开发启动脚本
├── CoPaw Desktop.vbs         # Windows 桌面启动脚本
├── LICENSE                   # 许可证
└── README.md                 # 项目文档
```

## ⚡ 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- npm 或 yarn

### Windows 一键启动

```powershell
# 直接运行开发脚本
.\run-dev.ps1
```

脚本会自动：
1. 检查并启动后端服务（端口 8787）
2. 检查并启动前端服务（端口 5173）
3. 自动打开浏览器访问应用

### 手动启动

**1. 启动后端**

```powershell
cd web/backend

# 创建虚拟环境
py -m venv .venv

# 激活虚拟环境
.\.venv\Scripts\Activate.ps1

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（复制模板并修改）
copy .env.example .env

# 启动服务
uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload
```

**2. 启动前端**

```powershell
cd web

# 安装依赖
npm install

# 配置环境变量（复制模板）
copy .env.example .env

# 启动开发服务器
npm run dev
```

### 登录信息

- **邮箱**: `admin@local`
- **密码**: `change-me-now`

> ⚠️ 首次登录后请立即修改密码

## 🔧 配置说明

### 后端配置 (`web/backend/.env`)

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `APP_ENV` | 运行环境 | `dev` |
| `APP_HOST` | 后端主机 | `127.0.0.1` |
| `APP_PORT` | 后端端口 | `8787` |
| `CORS_ORIGINS` | CORS 允许的源 | `http://localhost:5173` |
| `DB_URL` | 数据库连接 | `sqlite:///./copaw.db` |
| `AUTH_DISABLED` | 是否禁用认证 | `true` |
| `JWT_SECRET` | JWT 密钥 | `dev-secret-change-me` |
| `BOOTSTRAP_ADMIN_EMAIL` | 管理员邮箱 | `admin@local` |
| `BOOTSTRAP_ADMIN_PASSWORD` | 管理员密码 | `change-me-now` |
| `PROVIDER` | AI 提供商 | `openai_compat` |
| `OPENAI_BASE_URL` | OpenAI API 地址 | `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | OpenAI API 密钥 | `REPLACE_ME` |
| `OPENAI_MODEL` | 默认模型 | `gpt-4.1-mini` |
| `OLLAMA_BASE_URL` | Ollama 地址 | `http://127.0.0.1:11434` |

### 前端配置 (`web/.env`)

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_BACKEND_URL` | 后端 API 地址 | `/api` |

## 🤖 AI 模型配置

### 使用 OpenAI API

1. 在 OpenAI 平台获取 API Key
2. 修改 `web/backend/.env`:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

### 使用 Ollama（本地模型）

1. 安装 [Ollama](https://ollama.com/download)
2. 拉取模型：
   ```powershell
   ollama pull llama3.1
   ```
3. 确保 Ollama 服务运行在 `http://127.0.0.1:11434`
4. 登录后在「连接与模型设置」中配置

## 🚀 生产部署

### 构建前端

```powershell
cd web
npm run build
```

### 后端部署

```powershell
cd web/backend

# 使用生产级服务器
uvicorn app.main:app --host 0.0.0.0 --port 8787

# 或使用 Gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

## 🔒 安全建议

1. **修改默认密码** - 首次登录后立即修改管理员密码
2. **更新 JWT_SECRET** - 使用强随机字符串
3. **禁用 AUTH_DISABLED** - 生产环境设置为 `false`
4. **配置 HTTPS** - 使用反向代理（如 Nginx）启用 HTTPS
5. **限制 CORS_ORIGINS** - 生产环境指定具体域名

## 📝 开发指南

### 代码规范

- Python: 使用 `black` 和 `flake8` 进行代码格式化
- TypeScript: 使用 ESLint 和 Prettier

### 提交规范

```
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
style: 代码格式调整
refactor: 代码重构
test: 添加测试
```

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**CoPaw** - 专业的 AI 对话平台