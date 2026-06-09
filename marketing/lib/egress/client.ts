// Marketing slim version: relies on the global fetch (Next.js handles relative
// URLs and credentials in-process). The front variant rewrites URLs and
// merges per-request auth headers because front-spa is cross-origin; marketing
// has no such concern, so this is just a pass-through.
export async function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, init);
}
