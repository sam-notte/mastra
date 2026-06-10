import type { AgentBrowserSession, AgentBrowserThreadManagerConfig } from '@mastra/agent-browser';
import { AgentBrowserThreadManager } from '@mastra/agent-browser';
import type { BrowserLaunchOptions } from 'agent-browser';
import { BrowserManager } from 'agent-browser';
import type { NotteClient, Session } from 'notte-sdk';
import { provisionNotteSession, safeStopNotteSession } from './notte-session';
import type { NotteSessionOptions } from './types';

/** Thread session that tracks its Notte cloud session for cleanup. */
export interface NotteAgentBrowserSession extends AgentBrowserSession {
  notteSession?: Session;
}

export interface NotteAgentBrowserThreadManagerConfig extends AgentBrowserThreadManagerConfig {
  notte: NotteClient;
  /** Resolve an HTTP CDP URL to a websocket URL (no-op if already ws://). */
  resolveWebSocketUrl: (url: string) => Promise<string>;
  /** Options for each `notte.Session(...)` (thread scope = one session per thread). */
  sessionOptions?: NotteSessionOptions;
}

/**
 * Provisions a dedicated Notte cloud session per Mastra thread and connects
 * the agent-browser BrowserManager to it over CDP.
 */
export class NotteAgentBrowserThreadManager extends AgentBrowserThreadManager {
  private readonly notte: NotteClient;
  private readonly resolveWebSocketUrl: (url: string) => Promise<string>;
  private readonly sessionOptions: NotteSessionOptions;

  constructor(config: NotteAgentBrowserThreadManagerConfig) {
    super(config);
    this.notte = config.notte;
    this.resolveWebSocketUrl = config.resolveWebSocketUrl;
    this.sessionOptions = config.sessionOptions ?? {};
  }

  protected override async createSession(threadId: string): Promise<NotteAgentBrowserSession> {
    const savedState = this.getSavedBrowserState(threadId);

    const session: NotteAgentBrowserSession = {
      threadId,
      createdAt: Date.now(),
      browserState: savedState,
    };

    if (this.scope === 'thread') {
      const provisioned = await provisionNotteSession(this.notte, this.sessionOptions, this.logger);
      session.notteSession = provisioned.session;

      const manager = new BrowserManager();
      const wsUrl = await this.resolveWebSocketUrl(provisioned.cdpWsUrl);

      const launchOptions: BrowserLaunchOptions = {
        headless: this.browserConfig.headless ?? true,
        viewport: this.browserConfig.viewport,
        profile: this.browserConfig.profile,
        executablePath: this.browserConfig.executablePath,
        storageState: this.browserConfig.storageState,
        cdpUrl: wsUrl,
      };

      try {
        await manager.launch(launchOptions);
      } catch (error) {
        try {
          await manager.close();
        } catch {
          // ignore
        }
        await safeStopNotteSession(provisioned.session, this.logger);
        throw error;
      }

      session.manager = manager;
      this.threadManagers.set(threadId, manager);

      try {
        if (savedState && savedState.tabs.length > 0) {
          this.logger?.debug?.(`Restoring browser state for thread ${threadId}: ${savedState.tabs.length} tabs`);
          await this.restoreBrowserState(manager, savedState);
        }
        this.onBrowserCreated?.(manager, threadId);
      } catch (error) {
        this.threadManagers.delete(threadId);
        session.manager = undefined;
        try {
          await manager.close();
        } catch {
          // ignore
        }
        await safeStopNotteSession(provisioned.session, this.logger);
        throw error;
      }
    }

    return session;
  }

  protected override async doDestroySession(session: NotteAgentBrowserSession): Promise<void> {
    if (this.scope === 'thread' && session.manager) {
      try {
        await session.manager.close();
      } catch {
        // ignore
      }
      this.threadManagers.delete(session.threadId);
    }

    if (session.notteSession) {
      await safeStopNotteSession(session.notteSession, this.logger);
    }
  }
}
