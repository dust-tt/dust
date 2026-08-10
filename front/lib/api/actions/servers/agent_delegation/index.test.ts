import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import {
  GENERIC_RUN_AGENT_TOOL_NAME,
  GENERIC_RUN_AGENT_TOOL_SCHEMA,
} from "@app/lib/api/actions/servers/run_agent/metadata";
import type { Authenticator } from "@app/lib/auth";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import createAgentDelegationServer from "./index";

describe("agent_delegation", () => {
  it("exposes the generic runner", async () => {
    const server = await createAgentDelegationServer({} as Authenticator);
    const client = new Client({
      name: "agent-delegation-test",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: GENERIC_RUN_AGENT_TOOL_NAME,
      inputSchema: {
        properties: {
          agentId: expect.any(Object),
          description: expect.any(Object),
          executionMode: expect.any(Object),
          query: expect.any(Object),
        },
      },
    });
    expect(tools[0].inputSchema.required).toEqual(
      expect.arrayContaining(["agentId", "description", "query"])
    );

    await client.close();
  });

  it.each([
    "run-agent",
    "handoff",
  ] as const)("accepts %s execution mode", (executionMode) => {
    expect(
      z.object(GENERIC_RUN_AGENT_TOOL_SCHEMA).safeParse({
        agentId: "agent_123",
        description: "Summarize the work.",
        query: "Summarize the work.",
        executionMode: {
          value: executionMode,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
        },
      }).success
    ).toBe(true);
  });
});
