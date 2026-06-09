import { expect } from "vitest";

// eslint-disable-next-line require-yield
export async function* emptyAsyncIterator<T>(): AsyncGenerator<T, void> {
  return;
}

// Returns a generator factory that yields the given events then completes (EOF).
export function asyncIteratorFrom<T>(events: T[]) {
  return async function* (): AsyncGenerator<T, void> {
    for (const event of events) {
      yield event;
    }
  };
}

// Returns a generator factory that yields the given events then throws —
// exercises the mid-stream iterator-error codepath.
export function throwingAsyncIterator<T>(events: T[], error: Error) {
  return async function* (): AsyncGenerator<T, void> {
    for (const event of events) {
      yield event;
    }
    throw error;
  };
}

// Extracts the `data:` payloads from an SSE response body.
export function parseSseDataPayloads(body: string): string[] {
  return body
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => chunk.slice("data:".length).trim());
}

export async function expectEmptySseStream(
  response: Response,
  { expectDoneSentinel = false }: { expectDoneSentinel?: boolean } = {}
) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  const body = await response.text();
  if (expectDoneSentinel) {
    expect(body).toContain("data: done");
  } else {
    expect(body).not.toContain("data: done");
  }
}
