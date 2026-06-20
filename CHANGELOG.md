# Changelog

All notable changes to **Lecture Lens** are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

Release assets and full diffs: [GitHub Releases](https://github.com/Yima-Gu/obsidian-lecture-lens/releases).

---

## [Unreleased]

---

## [1.1.4] — 2026-06-14

**Minimum Obsidian version:** 1.8.7

### Added

- **Chat context:** Budget-aware allocation for attached notes, RAG excerpts, and conversation history (fills from newest turns until the character budget is used)
- **Chat context:** Model-aware defaults — switching provider/model adjusts context budget, history turn limit, and RAG top-K from `context_length` when available
- **Chat context panel:** Trim hints (omitted history turns, dropped RAG chunks, budget warnings) and current-message segment in the budget bar
- **Providers:** Kimi and DeepSeek model lists fetched from provider APIs (24h cache per profile)
- Obsidian wiki links for attached notes and RAG sources in chat context panel and composer chips
- Inline source citations in assistant replies (`[[Note#Section]]`), with post-processing for numbered refs and a fallback **Sources / 参考来源** block

### Fixed

- **Citations:** Assistant replies no longer repeat unrelated or deleted note links from earlier turns; only sources in the **current** request are kept
- **Citations:** Source footers appended to history are stripped before the next LLM request
- **Providers:** Kimi k2 / DeepSeek reasoning models use `temperature: 1` (API requirement)

### Changed

- **Chat UI:** Cursor-style composer, simplified context panel, unified icons
- **README / manifest:** Improved discoverability for Obsidian Community Plugins search

[1.1.4]: https://github.com/Yima-Gu/obsidian-lecture-lens/releases/tag/1.1.4

---

## [1.1.3] — 2026-06-14

**Minimum Obsidian version:** 1.8.7

### Fixed

- **Community plugin installs:** Obsidian’s catalog only ships `main.js`, `manifest.json`, and `styles.css`. Missing ONNX WASM and PDF.js worker caused embedding/RAG and PDF note failures (`ort-wasm-simd.wasm is missing`, `Setting up fake worker failed`, including Windows `app://` worker paths). Runtime files are now downloaded via `requestUrl` (jsDelivr) and loaded as Blob URLs when absent locally.
- First use of embedding or PDF features requires network (~10 MB one-time download).

### Changed

- **Chat:** Stream Markdown during SSE (throttled renders) instead of plain text until completion
- **Chat:** Auto-scroll only when the message list is pinned to the bottom
- **Chat:** Horizontal scroll for wide Markdown tables
- **README:** Community plugin install steps moved to the top; trimmed redundant manual install / maintainer docs

[1.1.3]: https://github.com/Yima-Gu/obsidian-lecture-lens/releases/tag/1.1.3

---

## [1.1.2] — 2026-06-13

**Minimum Obsidian version:** 1.8.7

### Fixed

- Obsidian community plugin review: `manifest.json` (`authorUrl`, `minAppVersion`), ESLint compliance (timers, `activeDocument`, fetch, dynamic import), sentence-case UI strings, popout compatibility warnings

### Changed

- Replaced lint-staged with husky shell pre-commit hook
- CSS and release workflow attestation adjustments from review recommendations

[1.1.2]: https://github.com/Yima-Gu/obsidian-lecture-lens/releases/tag/1.1.2

---

## [1.1.1] — 2026-06-13

### Added

- **Batch PDF → Markdown:** multi-select PDFs, editable output filenames, pre-run system prompt, glass progress HUD
- **Chat streaming fix:** assistant replies update incrementally during SSE
- Chat context panel, mermaid click-to-zoom, session rename/delete, refreshed modal and chat styling

### Changed

- README badges and release documentation updates

[1.1.1]: https://github.com/Yima-Gu/obsidian-lecture-lens/releases/tag/1.1.1

---

## [1.1.0] — 2026-06-12

First public release.

### Added

- **Chat sidebar** with Markdown/LaTeX, `@` vault note context, streaming, session history
- **Multimodal image analysis** — ribbon/modal, context menu, clipboard paste flow, batch per-image processing
- **LLM layer** — OpenAI-compatible API, provider presets (OpenAI, DeepSeek, Kimi, Gemini, Custom)
- **Course RAG** — local embedding index and retrieval from a course folder
- **PDF notes pipeline** (initial release)
- **i18n** — English / 中文 UI
- **Security** — API key encryption via OS keychain on desktop (`safeStorage`)
- CI release workflow and GitHub Actions build/lint

[1.1.0]: https://github.com/Yima-Gu/obsidian-lecture-lens/releases/tag/1.1.0
