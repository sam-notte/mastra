import { sessionDebugInfo } from 'notte-sdk';
import type { NotteClient, Session } from 'notte-sdk';
import type { NotteSessionOptions } from './types';

interface ProviderLogger {
  debug?: (message: string) => void;
  warn?: (message: string) => void;
}

/** A started Notte session plus the CDP websocket URL to drive it. */
export interface ProvisionedNotteSession {
  session: Session;
  sessionId: string;
  /** WebSocket URL to connect to the hosted browser using the CDP protocol. */
  cdpWsUrl: string;
}

/**
 * Create and start a Notte cloud session, then resolve the CDP websocket URL
 * that Mastra's BrowserManager connects to.
 */
export async function provisionNotteSession(
  notte: NotteClient,
  options: NotteSessionOptions,
  logger?: ProviderLogger,
): Promise<ProvisionedNotteSession> {
  const session = notte.Session(options);
  await session.start();

  const sessionId = session.getId();
  if (!sessionId) {
    await safeStopNotteSession(session, logger);
    throw new Error('Notte session started but returned no session id');
  }

  const cdpWsUrl = await resolveNotteCdpUrl(notte, session, sessionId, logger);
  return { session, sessionId, cdpWsUrl };
}

/**
 * Resolve the live CDP websocket endpoint for a running Notte session.
 *
 * Primary source is the session debug endpoint (`GET /sessions/{id}/debug`),
 * whose `ws.cdp` field is documented as "WebSocket URL to connect using CDP
 * protocol". A status `cdp_url` fallback is kept for deployments that surface it
 * there instead.
 *
 * NOTE for review: confirm with the API team that `ws.cdp` is the correct
 * endpoint to expose to an external CDP client for a Notte-hosted session.
 */
async function resolveNotteCdpUrl(
  notte: NotteClient,
  session: Session,
  sessionId: string,
  logger?: ProviderLogger,
): Promise<string> {
  try {
    // Generated client return shape is { data, error, request, response }.
    const res: any = await sessionDebugInfo({
      client: notte.getClient(),
      path: { session_id: sessionId },
    });
    const cdp = res?.data?.ws?.cdp;
    if (typeof cdp === 'string' && cdp.length > 0) {
      return cdp;
    }
    logger?.warn?.(`Notte sessionDebugInfo returned no ws.cdp for session ${sessionId}`);
  } catch (err) {
    logger?.warn?.(`Notte sessionDebugInfo(${sessionId}) failed: ${err}`);
  }

  try {
    const status: any = await session.status();
    const cdp = status?.cdp_url;
    if (typeof cdp === 'string' && cdp.length > 0) {
      return cdp;
    }
  } catch (err) {
    logger?.warn?.(`Notte session.status() cdp_url lookup failed: ${err}`);
  }

  throw new Error(
    `Could not resolve a CDP websocket URL for Notte session ${sessionId}. ` +
      'Expected ws.cdp from the session debug endpoint.',
  );
}

/** Stop a Notte session without throwing — used on cleanup paths. */
export async function safeStopNotteSession(session: Session, logger?: ProviderLogger): Promise<void> {
  try {
    await session.stop();
  } catch (err) {
    logger?.warn?.(`Notte session.stop() failed: ${err}`);
  }
}
