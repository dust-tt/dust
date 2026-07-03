import type {LightServerSideMCPToolConfigurationType} from "@app/lib/actions/mcp";
import type {ToolContextType} from "@app/lib/actions/types";
import {
  generateProcessToolOutput,
  getCoreDataSourceSearchCriterias,
  getPromptForProcessDustApp,
} from "@app/lib/api/actions/servers/extract_data/helpers";
import {EXTRACT_DATA_MAIN_TOOL_NAME} from "@app/lib/api/actions/servers/extract_data/metadata";
import {createExtractDataTools} from "@app/lib/api/actions/servers/extract_data/tools";
import {processDataSources} from "@app/lib/api/assistant/process_data_sources";
import type {Authenticator} from "@app/lib/auth";
import {Ok} from "@app/types/shared/result";
import {INTERNAL_MIME_TYPES} from "@dust-tt/client";
import type {JSONSchema7 as JSONSchema} from "json-schema";
import {beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("@app/lib/api/actions/servers/extract_data/helpers", () => ({
  generateProcessToolOutput: vi.fn(),
  getCoreDataSourceSearchCriterias: vi.fn(),
  getPromptForProcessDustApp: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/process_data_sources", () => ({
  processDataSources: vi.fn(),
}));

const CONFIGURED_JSON_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    name: {
      type: "string",
    },
  },
  required: ["name"],
};

const CONFIGURED_TIME_FRAME = {
  duration: 7,
  unit: "day" as const,
};

function makeRunContext(): ToolContextType {
  const toolConfiguration: LightServerSideMCPToolConfigurationType = {
    id: -1,
    sId: "tool-configuration-id",
    type: "mcp_configuration",
    name: EXTRACT_DATA_MAIN_TOOL_NAME,
    originalName: EXTRACT_DATA_MAIN_TOOL_NAME,
    mcpServerName: "extract_data",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: CONFIGURED_TIME_FRAME,
    jsonSchema: CONFIGURED_JSON_SCHEMA,
    additionalConfiguration: {},
    mcpServerViewId: "mcp-server-view-id",
    dustAppConfiguration: null,
    internalMCPServerId: null,
    secretName: null,
    dustProject: null,
    availability: "manual",
    permission: "never_ask",
    toolServerId: "tool-server-id",
    retryPolicy: "no_retry",
  };

  return {
    runContext: {
      contextType: "agent_loop",
      agentConfiguration: {
        model: {
          modelId: "test-model",
          providerId: "openai",
          temperature: 0,
        },
      },
      conversation: {},
      toolConfiguration,
    },
  } as unknown as ToolContextType;
}

describe("createExtractDataTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPromptForProcessDustApp).mockResolvedValue("prompt");
    vi.mocked(getCoreDataSourceSearchCriterias).mockResolvedValue(new Ok([]));
    vi.mocked(processDataSources).mockResolvedValue(
      new Ok({
        data: [],
        minTimestamp: 0,
        totalChunks: 0,
        totalDocuments: 0,
        totalTokens: 0,
      })
    );
    vi.mocked(generateProcessToolOutput).mockResolvedValue(
      new Ok({
        processToolOutput: [
          {
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXTRACT_QUERY,
              text: "Extracted from 0 documents over the last 7 days.",
              uri: "",
            },
          },
          {
            type: "resource",
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.EXTRACT_RESULT,
              text: "PROCESSED OUTPUTS:\n(none)",
              uri: "",
              path: "outputs/results.json",
              title: "results.json",
              contentType: "application/json",
              snippet: "[]",
            },
          },
        ],
      })
    );
  });

  it("returns a tool error when a stringified JSON schema is not an object", async () => {
    const auth = {} as Authenticator;
    const toolContext = makeRunContext();
    const tools = createExtractDataTools(auth, toolContext);
    const tool = tools.find((t) => t.name === EXTRACT_DATA_MAIN_TOOL_NAME);

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("Expected extract_data tool to be created.");
    }

    const result = await tool.handler(
      {
        dataSources: [],
        objective: "Extract people names.",
        jsonSchema: "5",
      },
      {
        auth,
        toolContext,
      } as unknown as Parameters<typeof tool.handler>[1]
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected extract_data tool to reject the schema.");
    }
    expect(result.error.message).toContain(
      "Invalid jsonSchema: expected a valid JSON object"
    );
    expect(processDataSources).not.toHaveBeenCalled();
  });

  it("strips configured-input metadata before validating and processing", async () => {
    const auth = {} as Authenticator;
    const toolContext = makeRunContext();
    const tools = createExtractDataTools(auth, toolContext);
    const tool = tools.find((t) => t.name === EXTRACT_DATA_MAIN_TOOL_NAME);

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("Expected extract_data tool to be created.");
    }

    const result = await tool.handler(
      {
        dataSources: [],
        objective: "Extract people names.",
        jsonSchema: {
          ...CONFIGURED_JSON_SCHEMA,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
        },
        timeFrame: {
          ...CONFIGURED_TIME_FRAME,
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME,
        },
      },
      {
        auth,
        toolContext,
      } as unknown as Parameters<typeof tool.handler>[1]
    );

    expect(result.isOk()).toBe(true);
    expect(getCoreDataSourceSearchCriterias).toHaveBeenCalledWith(auth, [], {
      timeFrame: CONFIGURED_TIME_FRAME,
      tagsIn: undefined,
      tagsNot: undefined,
    });
    expect(processDataSources).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonSchema: CONFIGURED_JSON_SCHEMA,
      })
    );
    expect(generateProcessToolOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonSchema: CONFIGURED_JSON_SCHEMA,
        timeFrame: CONFIGURED_TIME_FRAME,
      })
    );
  });
});
