import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConfluenceClient } from "./confluence_client";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: mocks.fetch,
}));

async function getSentCql(
  call: (client: ConfluenceClient) => Promise<unknown>
) {
  await expect(call(new ConfluenceClient("token"))).rejects.toThrow();

  const [url] = mocks.fetch.mock.calls[0] ?? [];
  return new URL(url).searchParams.get("cql");
}

describe("ConfluenceClient CQL queries", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.fetch.mockRejectedValue(new Error("network down"));
  });

  it("escapes spaceKey in getPagesByIdsInSpace", async () => {
    const cql = await getSentCql((client) =>
      client.getPagesByIdsInSpace({
        spaceKey: 'X" OR space!="X\\',
        pageIds: ["123"],
      })
    );

    expect(cql).toBe(
      'type=page AND space="X\\" OR space!=\\"X\\\\" AND id in (123)'
    );
  });

  it("escapes spaceKey in getChildContent", async () => {
    const cql = await getSentCql((client) =>
      client.getChildContent({
        limit: 10,
        pageCursor: null,
        parentContentId: "123",
        spaceKey: 'X" OR title~"secret',
      })
    );

    expect(cql).toBe(
      'type IN (page, folder) AND space="X\\" OR title~\\"secret" AND parent=123'
    );
  });
});
