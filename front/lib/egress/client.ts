// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // eslint-disable-next-line no-restricted-globals
  return fetch(input, init);
}
