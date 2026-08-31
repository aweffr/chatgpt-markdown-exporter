const MESSAGE_SOURCE = "chatgpt-markdown-exporter-page-bridge";

interface BridgePayload {
  source: typeof MESSAGE_SOURCE;
  type: "session-context";
  token?: string;
  conversationId?: string;
}

function headerValue(
  headers: HeadersInit | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  return new Headers(headers).get(name);
}

function inspectRequest(input: RequestInfo | URL, init?: RequestInit): void {
  const request = input instanceof Request ? input : null;
  const requestUrl = request?.url ?? String(input);
  const authorization =
    headerValue(init?.headers, "authorization") ??
    request?.headers.get("authorization") ??
    undefined;
  const token = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1];
  const conversationId = requestUrl.match(
    /\/backend-api\/conversation\/([^/?#]+)/u,
  )?.[1];
  if (!token && !conversationId) return;

  const payload: BridgePayload = {
    source: MESSAGE_SOURCE,
    type: "session-context",
    ...(token ? { token } : {}),
    ...(conversationId
      ? { conversationId: decodeURIComponent(conversationId) }
      : {}),
  };
  window.postMessage(payload, window.location.origin);
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (
  ...args: Parameters<typeof window.fetch>
): Promise<Response> => {
  inspectRequest(args[0], args[1]);
  return originalFetch(...args);
};
