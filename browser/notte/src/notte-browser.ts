import type { AgentBrowserConfig } from '@mastra/agent-browser';
import { AgentBrowser } from '@mastra/agent-browser';
import type { BrowserLaunchOptions } from 'agent-browser';
import { BrowserManager } from 'agent-browser';
import { NotteClient } from 'notte-sdk';
import type { Session } from 'notte-sdk';
import { provisionNotteSession, safeStopNotteSession } from './notte-session';
import { NotteAgentBrowserThreadManager } from './notte-thread-manager';
import { resolveCdpWebSocketUrl } from './resolve-cdp';
import type { NotteBrowserConfig, NotteSessionOptions } from './types';

function pickSessionOpts(c: NotteBrowserConfig): NotteSessionOptions {
  return c.notte ?? {};
}

function toBaseConfig(config: NotteBrowserConfig): AgentBrowserConfig {
  const { apiKey: _a, baseUrl: _u, notte: _n, ...rest } = config;
  return rest;
}

/**
 * Mastra browser provider backed by [Notte](https://notte.cc) cloud browser
 * sessions: provisions a stealth session via the Notte API and drives it with
 * the same deterministic tools as {@link AgentBrowser} (snapshot + refs),
 * connected over the session's CDP endpoint.
 *
 * Notte supplies the production browser layer (anti-detection, residential
 * proxies, CAPTCHA handling); the agent-browser toolset supplies perception and
 * actions. This is the same shape as `@mastra/browser-firecrawl`.
 */
export class NotteBrowser extends AgentBrowser {
  override readonly name = 'NotteBrowser';
  override readonly provider = 'notte/browser-session';

  /** Narrowed from base `MastraBrowser` (`unknown`) — same pattern as {@link AgentBrowser}. */
  declare protected sharedManager: BrowserManager | null;

  private readonly notte: NotteClient;
  private readonly sessionOpts: NotteSessionOptions;
  private sharedNotteSession?: Session;

  constructor(config: NotteBrowserConfig = {}) {
    const apiKey = config.apiKey ?? process.env.NOTTE_API_KEY;
    if (!apiKey) {
      throw new Error('NotteBrowser requires `apiKey` or NOTTE_API_KEY');
    }
    const notte = new NotteClient({ apiKey, baseUrl: config.baseUrl });
    const sessionOpts = pickSessionOpts(config);

    super({
      ...toBaseConfig(config),
      createThreadManager: opts =>
        new NotteAgentBrowserThreadManager({
          ...opts,
          notte,
          resolveWebSocketUrl: url => resolveCdpWebSocketUrl(url, opts.logger),
          sessionOptions: sessionOpts,
        }),
    });
    this.notte = notte;
    this.sessionOpts = sessionOpts;
  }

  protected override async doLaunch(): Promise<void> {
    const scope = this.threadManager.getScope();
    if (scope === 'thread') {
      // Per-thread sessions are provisioned lazily by the thread manager.
      await super.doLaunch();
      return;
    }

    const provisioned = await provisionNotteSession(this.notte, this.sessionOpts, this.logger);
    this.sharedManager = new BrowserManager();

    try {
      const localConfig = this.config as AgentBrowserConfig;
      const wsUrl = await resolveCdpWebSocketUrl(provisioned.cdpWsUrl, this.logger);

      const launchOptions: BrowserLaunchOptions = {
        headless: localConfig.headless ?? true,
        viewport: localConfig.viewport,
        profile: localConfig.profile,
        executablePath: localConfig.executablePath,
        storageState: localConfig.storageState,
        cdpUrl: wsUrl,
      };

      await this.sharedManager.launch(launchOptions);
      this.threadManager.setSharedManager(this.sharedManager);
      this.setupCloseListenerForSharedScope(this.sharedManager);
      this.sharedNotteSession = provisioned.session;
    } catch (launchErr) {
      try {
        await this.sharedManager.close();
      } catch (closeErr) {
        this.logger?.warn?.(`BrowserManager.close() after failed shared launch: ${closeErr}`);
      }
      await safeStopNotteSession(provisioned.session, this.logger);
      this.sharedManager = null;
      this.sharedNotteSession = undefined;
      throw launchErr;
    }
  }

  protected override async doClose(): Promise<void> {
    const session = this.sharedNotteSession;
    await super.doClose();
    if (session) {
      await safeStopNotteSession(session, this.logger);
      this.sharedNotteSession = undefined;
    }
  }
}
