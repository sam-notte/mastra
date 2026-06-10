# @mastra/browser-notte

Mastra browser provider backed by [Notte](https://notte.cc) cloud browser sessions.

`NotteBrowser` extends [`AgentBrowser`](../agent-browser) and runs the same deterministic browser tools (snapshot + refs, Playwright over CDP) against Notte's hosted, stealth browser sessions instead of a local or self-hosted browser. Notte provides the production browser layer (anti-detection, residential proxies, CAPTCHA handling) and exposes each session over CDP; the agent-browser toolset provides perception and actions.

This is the same shape as [`@mastra/browser-firecrawl`](../firecrawl): a hosted-CDP provider on top of `AgentBrowser`.

## Installation

```bash
npm install @mastra/browser-notte
```

## Usage

```typescript
import { Agent } from '@mastra/core/agent';
import { NotteBrowser } from '@mastra/browser-notte';

const browser = new NotteBrowser({
  apiKey: process.env.NOTTE_API_KEY, // or set NOTTE_API_KEY and omit
  notte: {
    // options forwarded to notte.Session(...)
    // e.g. timeout_minutes: 30, proxies: true
  },
});

const agent = new Agent({
  name: 'web-agent',
  instructions: `You are a web automation assistant.
Use browser_snapshot to see the page structure,
then interact with elements using their refs (e.g., @e5).`,
  model: 'openai/gpt-5.4',
  browser,
});

const result = await agent.generate('Go to example.com and click the first link');
```

## Configuration

`NotteBrowserConfig` extends `AgentBrowserConfig`, so all agent-browser options apply (`headless`, `viewport`, `scope`, `excludeTools`, `storageState`, ...). Notte-specific options:

| Option | Description |
| --- | --- |
| `apiKey` | Notte API key. Falls back to `NOTTE_API_KEY`. |
| `baseUrl` | Notte API base URL. Defaults to the SDK default (`https://api.notte.cc`). |
| `notte` | Options forwarded to `notte.Session(...)` per provisioned session. |

### Scope

- `scope: 'thread'` (default) provisions one Notte session per Mastra thread, for isolated parallel agents.
- `scope: 'shared'` provisions a single Notte session shared across threads.

## How it works

1. On launch, the provider calls `notte.Session(...).start()` to create a hosted browser session.
2. It resolves the session's live CDP websocket endpoint (`ws.cdp` from the session debug endpoint).
3. It connects the agent-browser `BrowserManager` to that endpoint over CDP.
4. All deterministic browser tools then run against the Notte-hosted browser.
5. On close, the provider stops the Notte session.
