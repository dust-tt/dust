import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { TOOLS } from "@app/lib/api/actions/servers/gmail/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";

function getGmailTool(name: string) {
  const tool = TOOLS.find((t) => t.name === name);

  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

function expectToolResultOk(
  result: Awaited<ReturnType<(typeof TOOLS)[number]["handler"]>>
) {
  expect(result.isOk()).toBe(true);

  if (result.isErr()) {
    throw new Error(result.error.message);
  }

  return result.value;
}

function makeExtra(): ToolHandlerExtra {
  return {
    authInfo: {
      token: "gmail-access-token",
    },
  } as ToolHandlerExtra;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

describe("Gmail organization tools", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists Gmail labels", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse({
        labels: [
          { id: "INBOX", name: "INBOX", type: "system" },
          { id: "Label_1", name: "Legal", type: "user" },
        ],
      })
    );

    const result = await getGmailTool("list_labels").handler({}, makeExtra());
    const value = expectToolResultOk(result);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer gmail-access-token",
        },
      }
    );
    expect(value[1]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"name": "Legal"'),
    });
  });

  it("moves messages to a named label and archives by default", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          labels: [{ id: "Label_42", name: "Legal", type: "user" }],
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await getGmailTool("move_messages_to_label").handler(
      {
        messageIds: [" msg-1 ", "msg-1", "msg-2"],
        label: "legal",
      },
      makeExtra()
    );

    expectToolResultOk(result);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer gmail-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: ["msg-1", "msg-2"],
          addLabelIds: ["Label_42"],
          removeLabelIds: ["INBOX"],
        }),
      }
    );
  });

  it("archives messages without fetching labels", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await getGmailTool("archive_messages").handler(
      {
        messageIds: ["msg-1", "msg-2"],
      },
      makeExtra()
    );

    expectToolResultOk(result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer gmail-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: ["msg-1", "msg-2"],
          removeLabelIds: ["INBOX"],
        }),
      }
    );
  });

  it("requires at least one label update", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await getGmailTool("update_message_labels").handler(
      {
        messageIds: ["msg-1"],
      },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "At least one label must be provided to add or remove"
      );
    }
  });
});
