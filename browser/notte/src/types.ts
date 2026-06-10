import type { AgentBrowserConfig } from '@mastra/agent-browser';
import type { SessionOptions } from 'notte-sdk';

/**
 * Options forwarded to `notte.Session(...)` when a session is provisioned.
 *
 * `cdp_url` is intentionally omitted: that field tells Notte to attach to an
 * external CDP provider, whereas this provider does the opposite — it lets Notte
 * host the browser and connects Mastra's tools to it over the session's own CDP
 * endpoint.
 */
export type NotteSessionOptions = Omit<SessionOptions, 'cdp_url'>;

/**
 * Configuration for {@link NotteBrowser}.
 *
 * Extends {@link AgentBrowserConfig} so all the deterministic agent-browser
 * options (viewport, headless, scope, excludeTools, storageState, ...) apply
 * unchanged. The Notte-specific fields below control how the hosted session is
 * created.
 */
export type NotteBrowserConfig = AgentBrowserConfig & {
  /** Notte API key (or set `NOTTE_API_KEY` in the environment and omit). */
  apiKey?: string;
  /** Base URL for the Notte API. Defaults to the SDK default (`https://api.notte.cc`). */
  baseUrl?: string;
  /**
   * Notte-only session options passed to `notte.Session(...)`, e.g.
   * `{ timeout_minutes: 30, proxies: true }`. Distinct from the local
   * agent-browser options on {@link AgentBrowserConfig}.
   */
  notte?: NotteSessionOptions;
};
