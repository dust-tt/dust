import { createServiceNowClient } from "@app/lib/api/actions/servers/servicenow/client";
import { untrustedFetch } from "@app/lib/egress/server";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Response } from "undici";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/egress/server", () => ({
  untrustedFetch: vi.fn(),
}));

const INSTANCE_URL = "https://example.service-now.com";

function makeAuthInfo(instanceUrl: string = INSTANCE_URL): AuthInfo {
  return {
    token: "servicenow-access-token",
    clientId: "",
    scopes: [],
    extra: { servicenow_instance_url: instanceUrl },
  };
}

function getClient(instanceUrl?: string) {
  const result = createServiceNowClient(makeAuthInfo(instanceUrl));
  expect(result.isOk()).toBe(true);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function requestedUrl(callIndex = 0): string {
  const call = vi.mocked(untrustedFetch).mock.calls[callIndex];
  return String(call[0]);
}

function makeRecord(sysId: string, overrides: Record<string, unknown> = {}) {
  return {
    sys_id: sysId,
    number: `INC00${sysId.slice(0, 5)}`,
    short_description: "An incident",
    priority: "3 - Moderate",
    state: "New",
    opened_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

const SYS_ID_A = "1".repeat(32);
const SYS_ID_B = "2".repeat(32);
const SYS_ID_C = "3".repeat(32);

describe("ServiceNowClient pagination (via listRecords)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests one extra row to detect hasMore and returns nextCursor/returnedCount", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({
        result: [
          makeRecord(SYS_ID_A),
          makeRecord(SYS_ID_B),
          makeRecord(SYS_ID_C),
        ],
      })
    );

    const client = getClient();
    const result = await client.listRecords("incident", { limit: 2 });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.returnedCount).toBe(2);
    expect(result.value.hasMore).toBe(true);
    expect(result.value.nextCursor).toBe(SYS_ID_B);
    expect(result.value.records.map((r) => r.sys_id)).toEqual([
      SYS_ID_A,
      SYS_ID_B,
    ]);

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("sysparm_limit")).toBe("3");
    expect(url.searchParams.get("sysparm_query")).toBe("ORDERBYsys_id");
  });

  it("walks a second page with a keyset cursor and no gaps", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: [makeRecord(SYS_ID_B), makeRecord(SYS_ID_C)] })
    );

    const client = getClient();
    const result = await client.listRecords("incident", {
      limit: 2,
      cursor: SYS_ID_A,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.hasMore).toBe(false);
    expect(result.value.nextCursor).toBeNull();
    expect(result.value.returnedCount).toBe(2);

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("sysparm_query")).toBe(
      `sys_id>${SYS_ID_A}^ORDERBYsys_id`
    );
  });

  it("rejects a malformed cursor without making a request", async () => {
    const client = getClient();
    const result = await client.listRecords("incident", {
      cursor: "not-a-sys-id",
    });

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });

  it("clamps limit to the max page size", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: [] })
    );

    const client = getClient();
    await client.listRecords("incident", { limit: 1_000_000 });

    const url = new URL(requestedUrl());
    // MAX_PAGE_LIMIT (1000) + 1 for the hasMore probe row.
    expect(url.searchParams.get("sysparm_limit")).toBe("1001");
  });

  it("force-includes sys_id when a field projection is requested", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: [] })
    );

    const client = getClient();
    await client.listRecords("incident", { fields: ["priority"] });

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("sysparm_fields")).toBe("sys_id,priority");
  });

  it("rejects an invalid field name", async () => {
    const client = getClient();
    const result = await client.listRecords("incident", {
      fields: ["../etc/passwd"],
    });

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });

  it("translates date filters into ServiceNow encoded-query clauses", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: [] })
    );

    const client = getClient();
    await client.listRecords("incident", {
      createdAfter: "2026-01-01T00:00:00Z",
      createdBefore: "2026-02-01T00:00:00Z",
      updatedAfter: "2026-01-15T12:30:00Z",
    });

    const url = new URL(requestedUrl());
    expect(url.searchParams.get("sysparm_query")).toBe(
      "sys_created_on>=2026-01-01 00:00:00^sys_created_on<=2026-02-01 00:00:00" +
        "^sys_updated_on>=2026-01-15 12:30:00^ORDERBYsys_id"
    );
  });

  it("rejects an unparseable date filter", async () => {
    const client = getClient();
    const result = await client.listRecords("incident", {
      createdAfter: "not-a-date",
    });

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });

  it("fetches an exact total count only when includeTotalCount is set", async () => {
    vi.mocked(untrustedFetch)
      .mockResolvedValueOnce(jsonResponse({ result: [makeRecord(SYS_ID_A)] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { result: [{ sys_id: SYS_ID_A }] },
          { headers: { "X-Total-Count": "5300" } }
        )
      );

    const client = getClient();
    const result = await client.listRecords("incident", {
      includeTotalCount: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.totalCount).toBe(5300);
    expect(untrustedFetch).toHaveBeenCalledTimes(2);

    const countUrl = new URL(requestedUrl(1));
    expect(countUrl.searchParams.get("sysparm_no_count")).toBe("false");
  });

  it("counts against the full result set, not just what's left after the cursor", async () => {
    vi.mocked(untrustedFetch)
      .mockResolvedValueOnce(
        jsonResponse({
          result: [makeRecord(SYS_ID_B), makeRecord(SYS_ID_C)],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { result: [{ sys_id: SYS_ID_A }] },
          { headers: { "X-Total-Count": "5300" } }
        )
      );

    const client = getClient();
    const result = await client.listRecords("incident", {
      cursor: SYS_ID_A,
      includeTotalCount: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.totalCount).toBe(5300);

    // The count request must not carry the "sys_id>{cursor}" clause used for the page
    // itself — otherwise totalCount would shrink on every subsequent page instead of
    // reflecting the query's full result set.
    const countUrl = new URL(requestedUrl(1));
    expect(countUrl.searchParams.get("sysparm_query")).not.toContain("sys_id>");
  });
});

describe("ServiceNowClient generic table access (listRecords/getRecord)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts any well-formed table name, not just the built-in examples", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: [] })
    );

    const client = getClient();
    const result = await client.listRecords("u_custom_table", {});

    expect(result.isOk()).toBe(true);
    const url = new URL(requestedUrl());
    expect(url.pathname).toBe("/api/now/table/u_custom_table");
  });

  it("rejects a malformed table name without making a request", async () => {
    const client = getClient();
    const result = await client.listRecords("incident/../sys_user", {});

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });

  it("surfaces ServiceNow's own error when the table doesn't exist or is inaccessible", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse(
        { error: { message: "Invalid table sys_user_password" } },
        { status: 400 }
      )
    );

    const client = getClient();
    const result = await client.listRecords("sys_user_password", {});

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected an error");
    }
    expect(result.error.code).toBe(400);
    expect(result.error.message).toContain("Invalid table sys_user_password");
  });

  it("prefixes a 403 on a table the account has no access to as an ACL issue", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse(
        { error: { message: "Insufficient rights" } },
        { status: 403 }
      )
    );

    const client = getClient();
    const result = await client.listRecords("sys_user", {});

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected an error");
    }
    expect(result.error.code).toBe(403);
    expect(result.error.message.toLowerCase()).toContain("acl");
    expect(result.error.message).toContain("Insufficient rights");
  });

  it("builds a safe path for get_record and force-includes sys_id in projection", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: { sys_id: SYS_ID_A, short_description: "hi" } })
    );

    const client = getClient();
    const result = await client.getRecord("problem", SYS_ID_A, [
      "short_description",
    ]);

    expect(result.isOk()).toBe(true);
    const url = new URL(requestedUrl());
    expect(url.pathname).toBe(`/api/now/table/problem/${SYS_ID_A}`);
    expect(url.searchParams.get("sysparm_fields")).toBe(
      "sys_id,short_description"
    );
  });

  it("rejects a malformed sys_id without making a request", async () => {
    const client = getClient();
    const result = await client.getRecord("incident", "'; DROP TABLE--", []);

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });

  it("treats a 404 from ServiceNow as not-found (Ok(null)), not an error", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "No Record found" } }, { status: 404 })
    );

    const client = getClient();
    const result = await client.getRecord("kb_knowledge", SYS_ID_A);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBeNull();
  });
});

describe("ServiceNowClient generic table writes (createRecord/updateRecord)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts to any well-formed table with display-value flags set for human-readable writes", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: { sys_id: SYS_ID_A, short_description: "hi" } })
    );

    const client = getClient();
    const result = await client.createRecord("problem", {
      short_description: "hi",
    });

    expect(result.isOk()).toBe(true);
    const url = new URL(requestedUrl());
    expect(url.pathname).toBe("/api/now/table/problem");
    expect(url.searchParams.get("sysparm_display_value")).toBe("true");
    expect(url.searchParams.get("sysparm_input_display_value")).toBe("true");
  });

  it("rejects a malformed table name on create without making a request", async () => {
    const client = getClient();
    const result = await client.createRecord("incident/../sys_user", {
      short_description: "hi",
    });

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });

  it("patches the record path for updateRecord", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ result: { sys_id: SYS_ID_A, priority: "1 - Critical" } })
    );

    const client = getClient();
    const result = await client.updateRecord("problem", SYS_ID_A, {
      priority: "1 - Critical",
    });

    expect(result.isOk()).toBe(true);
    const url = new URL(requestedUrl());
    expect(url.pathname).toBe(`/api/now/table/problem/${SYS_ID_A}`);
  });

  it("rejects a malformed sys_id on update without making a request", async () => {
    const client = getClient();
    const result = await client.updateRecord("incident", "'; DROP TABLE--", {
      priority: "1",
    });

    expect(result.isErr()).toBe(true);
    expect(untrustedFetch).not.toHaveBeenCalled();
  });
});

describe("ServiceNowClient error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves status, message, and detail; is not tracked for 4xx", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            message: "Insert failed",
            detail: "Field 'short_description' is mandatory",
          },
        },
        { status: 400 }
      )
    );

    const client = getClient();
    const result = await client.createRecord("incident", {});

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected an error");
    }
    expect(result.error.code).toBe(400);
    expect(result.error.tracked).toBe(false);
    expect(result.error.message).toContain("Insert failed");
    expect(result.error.message).toContain(
      "Field 'short_description' is mandatory"
    );
  });

  it("tracks 5xx errors and prefixes 401/403 as authorization/ACL issues", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "Not authorized" } }, { status: 403 })
    );

    const client = getClient();
    const result = await client.getRecord("incident", SYS_ID_A);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected an error");
    }
    expect(result.error.code).toBe(403);
    expect(result.error.tracked).toBe(false);
    expect(result.error.message.toLowerCase()).toContain("acl");
    expect(result.error.message).toContain("Not authorized");
  });

  it("marks 5xx server errors as tracked", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "Internal error" } }, { status: 500 })
    );

    const client = getClient();
    const result = await client.getRecord("incident", SYS_ID_A);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected an error");
    }
    expect(result.error.code).toBe(500);
    expect(result.error.tracked).toBe(true);
  });

  it("flags a 429 as a rate-limit error", async () => {
    vi.mocked(untrustedFetch).mockResolvedValueOnce(
      jsonResponse({ error: { message: "Too many requests" } }, { status: 429 })
    );

    const client = getClient();
    const result = await client.getRecord("incident", SYS_ID_A);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected an error");
    }
    expect(result.error.code).toBe(429);
    expect(result.error.message.toLowerCase()).toContain("rate limit");
  });
});
