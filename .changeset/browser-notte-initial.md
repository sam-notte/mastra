---
"@mastra/browser-notte": minor
---

Add `@mastra/browser-notte`: a browser provider backed by Notte cloud browser sessions.

`NotteBrowser` extends `AgentBrowser` to run the same deterministic browser tools (snapshot + refs, Playwright over CDP) against Notte's hosted stealth sessions instead of a local or self-hosted browser. Notte supplies the production browser layer (anti-detection, residential proxies, CAPTCHA handling) and exposes each session over CDP; the agent-browser toolset supplies perception and actions. Same shape as `@mastra/browser-firecrawl`.

- Hosted browser sessions via the Notte API (`notte-sdk`)
- Per-thread or shared session scope
- Configurable via `NOTTE_API_KEY` or `apiKey`, with `notte` session options forwarded to `notte.Session(...)`
