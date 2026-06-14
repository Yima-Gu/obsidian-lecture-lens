# Lecture Lens

[![Release](https://img.shields.io/github/v/release/Yima-Gu/obsidian-lecture-lens?style=for-the-badge&logo=github&logoColor=white&label=Release&color=483699)](https://github.com/Yima-Gu/obsidian-lecture-lens/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-483699?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)

> Turn lecture slides and whiteboard photos into structured Obsidian notes — powered by multimodal LLMs.
>
> 基于多模态大模型的 Obsidian 课件笔记与课程复习助手。

[English](#english) · [中文](#中文)

---

<a name="english"></a>

## English

### Install

**Recommended — Obsidian Community Plugins**

1. Open **Settings → Community plugins**.
2. If this is your first plugin, turn off **Restricted mode**, then return to Community plugins.
3. Click **Browse**, search **Lecture Lens**, and click **Install**.
4. Back on the Community plugins page, enable **Lecture Lens**.
5. Reload Obsidian (**Cmd+R** on macOS, **Ctrl+R** on Windows/Linux).

You can also open the plugin page directly: [obsidian.md/plugins?id=lecture-lens](https://obsidian.md/plugins?id=lecture-lens)

**Alternative — manual install from GitHub**

Use this only if you cannot access Community plugins or need a specific release build.

1. Download the latest release from [GitHub Releases](https://github.com/Yima-Gu/obsidian-lecture-lens/releases/latest).
2. Extract all files into:
    ```
    <your-vault>/.obsidian/plugins/lecture-lens/
    ```
    The folder name must be `lecture-lens`.
3. Enable **Lecture Lens** under **Settings → Community plugins**, then reload Obsidian.

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

### Quick start

1. **Settings → Lecture Lens** — pick a provider preset, enter API key, click **Check connection**
2. Optional: set **Course folder** and click **Rebuild index** for RAG
3. Open chat from the glasses ribbon icon, or paste a screenshot into a note

### Supported providers (presets)

| Provider | Base URL                          | Default model                   |
| -------- | --------------------------------- | ------------------------------- |
| OpenAI   | `https://api.openai.com/v1`       | `gpt-4o`                        |
| DeepSeek | `https://api.deepseek.com`        | `deepseek-v4-flash`             |
| Kimi     | `https://api.moonshot.cn/v1`      | `moonshot-v1-8k-vision-preview` |
| Gemini   | Google OpenAI-compatible endpoint | `gemini-2.0-flash`              |

> **Vision chat**: use a VLM such as `gpt-4o`, Kimi `*-vision-*`, or `deepseek-vl2`. Text models like `deepseek-v4-flash` do not accept images.

> **Recommended (author-tested):** **DeepSeek** for text-heavy work (chat, PDF → Markdown) and **Kimi (Moonshot)** for vision / image uploads.

### Security & privacy

- **Local-first** — notes stay in your vault; RAG index is stored under `.obsidian/plugins/lecture-lens/`
- **Explicit file context** — chat only reads vault notes you attach via `@` or the current-note chip
- **API key storage** — encrypted with OS keychain on desktop when available; local storage on mobile
- **Network** — API calls go only to the LLM endpoint you configure; no hidden telemetry

### Development

```bash
git clone git@github.com:Yima-Gu/obsidian-lecture-lens.git lecture-lens
cd lecture-lens && npm install && npm run dev
```

Copy or build into `<vault>/.obsidian/plugins/lecture-lens/`, enable the plugin, and reload. See [AGENTS.md](./AGENTS.md) for contributor conventions.

---

<a name="中文"></a>

## 中文

### 安装

**推荐 — Obsidian 社区插件**

1. 打开 **设置 → 第三方插件**。
2. 若是首次安装插件，先关闭 **安全模式**，再回到第三方插件页面。
3. 点击 **浏览**，搜索 **Lecture Lens**，点击 **安装**。
4. 返回第三方插件列表，启用 **Lecture Lens**。
5. 重载 Obsidian（macOS：**Cmd+R**；Windows / Linux：**Ctrl+R**）。

也可直接打开插件页：[obsidian.md/plugins?id=lecture-lens](https://obsidian.md/plugins?id=lecture-lens)

**备选 — 从 GitHub 手动安装**

仅在无法使用社区插件、或需要指定版本时使用。

1. 从 [GitHub Releases](https://github.com/Yima-Gu/obsidian-lecture-lens/releases/latest) 下载最新版。
2. 解压到：
    ```
    <你的库>/.obsidian/plugins/lecture-lens/
    ```
    文件夹名必须为 `lecture-lens`。
3. 在 **设置 → 第三方插件** 中启用 **Lecture Lens**，然后重载 Obsidian。

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

### 快速上手

1. **设置 → Lecture Lens** — 选择 API 提供商、填写密钥、**检查连接**
2. 可选：设置**课程文件夹**并**重建索引**
3. 点击侧边栏眼镜图标打开聊天，或在笔记中粘贴截图

### 推荐 API 配置

> **作者实测可用：** **DeepSeek** 适合文字类任务（聊天、PDF 转 Markdown）；**Kimi（月之暗面）** 适合识图 / 多模态上传。

### 安全说明

- 笔记与 RAG 索引均保存在本地库内
- 聊天仅读取你通过 `@` 或「当前笔记」显式附加的**库内** Markdown 文件
- **API 密钥**：桌面版优先使用系统钥匙串加密；移动端为本地存储，请妥善保管库访问权限
- 仅向你配置的 LLM 接口发起请求，无隐藏遥测

### 开发

```bash
git clone git@github.com:Yima-Gu/obsidian-lecture-lens.git lecture-lens
cd lecture-lens && npm install && npm run dev
```

构建产物放入 `<你的库>/.obsidian/plugins/lecture-lens/` 后启用并重载。贡献规范见 [AGENTS.md](./AGENTS.md)。

---

## License

MIT — see [LICENSE](./LICENSE).
