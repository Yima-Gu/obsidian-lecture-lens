# Lecture Lens

![GitHub release](https://img.shields.io/github/v/release/Yima-Gu/obsidian-lecture-lens)
![License](https://img.shields.io/github/license/Yima-Gu/obsidian-lecture-lens)

> Turn lecture slides and whiteboard photos into structured Obsidian notes — powered by multimodal LLMs.
>
> 基于多模态大模型的 Obsidian 课件笔记与课程复习助手。

[English](#english) · [中文](#中文)

---

<a name="english"></a>

## English

### What is Lecture Lens?

**Lecture Lens** helps you go from slides and screenshots to usable study notes inside Obsidian. It uses vision-capable LLMs to read images, extract structure, write LaTeX, and answer questions in the context of your course materials.

### Features

- **Slide & screenshot OCR** — paste or attach images; AI writes Markdown notes with formulas and diagrams
- **Chat sidebar** — Markdown/LaTeX rendering, `@` vault note context, optional image upload (VLM)
- **Course RAG** — index a course folder and retrieve relevant note chunks during chat
- **Context menu & batch analysis** — analyze one image or all images in a note
- **Clipboard paste flow** — save pasted screenshots and optionally analyze immediately
- **BYOK** — bring your own API key; presets for OpenAI, **DeepSeek**, **Kimi (Moonshot)**, Gemini, or Custom
- **i18n** — English / 中文 UI (follow Obsidian or choose manually)

### Supported providers (presets)

| Provider | Base URL | Default model |
|----------|----------|---------------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k-vision-preview` |
| Gemini | Google OpenAI-compatible endpoint | `gemini-2.0-flash` |

> **Vision chat**: use a VLM such as `gpt-4o`, Kimi `*-vision-*`, or `deepseek-vl2`. Text models like `deepseek-v4-flash` do not accept images.

### Installation

**From Obsidian Community Plugins** (when published)

1. Open **Settings → Community plugins**
2. Search **Lecture Lens** and install

**Manual / local development**

1. Clone into your vault:
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone git@github.com:Yima-Gu/obsidian-lecture-lens.git lecture-lens
   cd lecture-lens
   npm install
   npm run build
   ```
2. Enable the plugin in **Settings → Community plugins**
3. Reload Obsidian (`Cmd+R`)

> The plugin folder name must match `lecture-lens` (see `manifest.json` → `id`).

### Quick start

1. **Settings → Lecture Lens** — pick a provider preset, enter API key, click **Check connection**
2. Optional: set **Course folder** and click **Rebuild index** for RAG
3. Open chat from the glasses ribbon icon, or paste a screenshot into a note

### Security & privacy

- **Local-first** — notes stay in your vault; RAG index is stored under `.obsidian/plugins/lecture-lens/`
- **Explicit file context** — chat only reads vault notes you attach via `@` or the current-note chip (never arbitrary disk paths)
- **API key storage**
  - **Desktop**: encrypted with OS keychain via Electron `safeStorage` when available
  - **Mobile / fallback**: stored in plugin data (same risk as other local secrets — protect vault access)
- **Network** — API calls go only to the LLM endpoint you configure; no hidden telemetry

### Development

```bash
npm install
npm run dev      # watch build
npm run build    # production bundle → main.js
npm run lint
```

See [AGENTS.md](./AGENTS.md) for contributor conventions.

---

<a name="中文"></a>

## 中文

### 简介

**Lecture Lens** 帮助你在 Obsidian 里把课件截图和幻灯片变成可复习的结构化笔记。通过多模态大模型识图、提取要点、生成 LaTeX，并在课程笔记上下文中回答问题。

### 核心功能

- **课件 / 截图 OCR** — 粘贴或上传图片，AI 生成含公式与图表的 Markdown
- **聊天侧边栏** — 支持 Markdown/LaTeX 渲染、`@` 附加库内笔记、可选图片上传（需 VLM）
- **课程 RAG** — 对指定课程文件夹建索引，聊天时检索相关片段
- **右键与批量分析** — 单张或整篇笔记图片一键分析
- **粘贴 OCR** — 粘贴截图自动保存，可立即分析
- **自带 Key** — 预设 **DeepSeek**、**Kimi（月之暗面）**、OpenAI、Gemini 或自定义接口
- **中英界面** — 可跟随 Obsidian 或手动切换

### 安装

```bash
cd <你的库>/.obsidian/plugins
git clone git@github.com:Yima-Gu/obsidian-lecture-lens.git lecture-lens
cd lecture-lens && npm install && npm run build
```

在 **设置 → 第三方插件** 中启用 **Lecture Lens**，然后 **Cmd+R** 重载。

### 快速上手

1. **设置 → Lecture Lens** — 选择 API 提供商、填写密钥、**检查连接**
2. 可选：设置**课程文件夹**并**重建索引**
3. 点击侧边栏眼镜图标打开聊天，或在笔记中粘贴截图

### 安全说明

- 笔记与 RAG 索引均保存在本地库内
- 聊天仅读取你通过 `@` 或「当前笔记」显式附加的**库内** Markdown 文件
- **API 密钥**：桌面版优先使用系统钥匙串加密（`safeStorage`）；移动端为本地存储，请妥善保管库访问权限
- 仅向你配置的 LLM 接口发起请求，无隐藏遥测

### 开发

```bash
npm run dev    # 监听编译
npm run build  # 生产构建
```

---

## License

MIT — see [LICENSE](./LICENSE).
