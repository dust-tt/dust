import { makePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/pod_configuration_uri";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import {
  formatSandboxFunctionsList,
  listHandler,
} from "@app/lib/api/actions/servers/sandbox_functions/tools/list";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { sandboxFunctionContentType } from "@app/types/files";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const inputSchema: JSONSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: { greeting: { type: "string" } },
  required: ["greeting"],
};

async function makeFunction(
  auth: Authenticator,
  space: SpaceResource,
  { slug, description }: { slug: string; description: string }
): Promise<SandboxFunctionResource> {
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName: `${slug}.ts`,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });

  return SandboxFunctionResource.makeNew(auth, {
    space,
    file,
    slug,
    description,
    inputSchema,
    outputSchema,
  });
}

describe("formatSandboxFunctionsList", () => {
  it("returns an explicit empty message when there are none", () => {
    expect(formatSandboxFunctionsList([])).toBe(
      "No pod functions published in this pod."
    );
  });

  it("renders slug and description without schemas", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(authenticator, space, {
      slug: "greet",
      description: "Greet a user by name.",
    });

    const out = formatSandboxFunctionsList([fn]);

    expect(out).toContain("Pod functions:");
    expect(out).toContain("- greet: Greet a user by name.");
    expect(out).toContain("Use the get tool");
    // The verbose schemas live behind the get tool, not the list.
    expect(out).not.toContain("input:");
    expect(out).not.toContain("output:");
    // Neither the bundle filename nor the internal sId is surfaced.
    expect(out).not.toContain("greet.ts");
    expect(out).not.toContain(fn.sId);
  });

  it("lists every function", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    await makeFunction(authenticator, space, {
      slug: "greet",
      description: "Greet a user.",
    });
    await makeFunction(authenticator, space, {
      slug: "translate-text",
      description: "Translate text.",
    });

    const fns = await SandboxFunctionResource.listBySpace(authenticator, space);
    const out = formatSandboxFunctionsList(fns);

    expect(out).toContain("greet");
    expect(out).toContain("translate-text");
  });
});

describe("listHandler with a caller-supplied dustPod", () => {
  // Builds a ToolHandlerExtra for an agent loop running in a conversation that is NOT in a pod,
  // mirroring the pod_manager tools test setup.
  async function makeNonPodAgentLoopExtra(
    auth: Authenticator
  ): Promise<ToolHandlerExtra> {
    const workspace = auth.getNonNullableWorkspace();
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });

    const userMessage = conversation.content.flat().find(isUserMessageType);
    const agentMessage = conversation.content.flat().find(isAgentMessageType);
    assert(userMessage);
    assert(agentMessage);

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      functionCallName: "list",
      toolName: "list",
      mcpServerName: "sandbox_functions",
    });
    const { model, ...agentConfiguration } = agent;
    const runContext: AgentLoopRunContext = {
      contextType: "agent_loop",
      action,
      agentConfiguration,
      modelInfo: {
        endpoint: getTestStreamEndpoint(model.modelId),
        ...model,
      },
      agentMessage,
      conversation,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        retrievalTopK: 10,
        resumeState: null,
        websearchResultCount: 0,
      },
      toolConfiguration: action.toolConfiguration,
      userMessage,
    };

    return {
      auth,
      requestId: "sandbox-functions-list-dust-pod-test",
      runContext,
      sendNotification: async () => {},
      sendRequest: async () => {
        throw new Error("Unexpected MCP request");
      },
      signal: new AbortController().signal,
    };
  }

  it("fails outside a pod conversation when no dustPod is provided", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });
    const extra = await makeNonPodAgentLoopExtra(auth);

    const result = await listHandler({}, extra);

    assert(result.isErr());
    expect(result.error.message).toContain("not in a Pod");
  });

  it("resolves the pod from dustPod outside a pod conversation", async () => {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await auth.refresh();
    await makeFunction(auth, pod, {
      slug: "greet",
      description: "Greet a user by name.",
    });
    const extra = await makeNonPodAgentLoopExtra(auth);

    const result = await listHandler(
      {
        dustPod: {
          uri: makePodConfigurationURI(workspace.sId, pod.sId),
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
        },
      },
      extra
    );

    assert(result.isOk());
    const content = result.value[0];
    assert(content?.type === "text");
    expect(content.text).toContain("- greet: Greet a user by name.");
  });
});
