export const DEFAULT_ES_URL = "http://localhost:9250";
export const DEFAULT_INDEX = "agent_search";

export async function esRequest<T>(
  esUrl: string,
  method: string,
  path: string,
  body?: string,
  contentType = "application/json"
): Promise<T> {
  const res = await fetch(`${esUrl}${path}`, {
    method,
    headers: body ? { "Content-Type": contentType } : {},
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}
