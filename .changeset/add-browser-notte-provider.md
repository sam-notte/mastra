---
"@mastra/browser-notte": minor
---

Add `@mastra/browser-notte`, a browser provider backed by [Notte](https://notte.cc) cloud browser sessions. `NotteBrowser` extends `AgentBrowser` and runs the same deterministic browser tools (snapshot + refs, Playwright over CDP) against Notte's hosted stealth sessions — anti-detection, residential proxies, CAPTCHA handling — instead of a local or self-hosted browser. Same shape as `@mastra/browser-firecrawl`: a hosted-CDP provider on top of `AgentBrowser`. Supports per-thread and shared session scope.
