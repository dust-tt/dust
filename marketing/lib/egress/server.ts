// Marketing slim version: uses the global fetch (Node 18+ native) so we don't
// pull undici into the webpack graph. Marketing's outbound calls are limited
// to lightweight third-party APIs (e.g. HubSpot for forms); the front-side
// proxied egress lives in front and is unnecessary here.
export function untrustedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, init);
}

export function trustedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, init);
}
