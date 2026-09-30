import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { processAdditionalConfiguration } from "@app/lib/actions/additional_configuration";
import { DEFAULT_MCP_ACTION_DESCRIPTION } from "@app/lib/actions/constants";
import {
  getDefaultAdditionalConfiguration,
  getDefaultMCPActionDescription,
  getDefaultMCPActionPayload,
} from "@app/lib/actions/default_mcp_action";
import type { MCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/actions/mcp_internal_actions/input_configuration", () => ({
  getMCPServerRequirements: vi.fn(),
}));

const mockGetMCPServerRequirements = vi.mocked(getMCPServerRequirements);

const NO_REQUIREMENTS: MCPServerRequirements = {
  requiresDataSourceConfiguration: false,
  requiresDataWarehouseConfiguration: false,
  requiresTableConfiguration: false,
  requiresChildAgentConfiguration: false,
  mayRequireTimeFrameConfiguration: false,
  mayRequireJsonSchemaConfiguration: false,
  requiredStrings: [],
  requiredNumbers: [],
  requiredBooleans: [],
  requiredEnums: {},
  requiredLists: {},
  requiresDustAppConfiguration: false,
  requiresDustProjectConfiguration: false,
  developerSecretSelection: null,
  noRequirement: true,
};

describe("default MCP action", () => {
  beforeEach(() => {
    mockGetMCPServerRequirements.mockReturnValue(NO_REQUIREMENTS);
  });

  it("stores the builder's default inputs, flattened", () => {
    mockGetMCPServerRequirements.mockReturnValue({
      ...NO_REQUIREMENTS,
      requiredBooleans: [
        { key: "nested.flag", description: "A flag", default: null },
      ],
      requiredEnums: {
        mode: {
          options: [{ value: "fast", label: "Fast" }],
          description: "Mode",
          default: null,
        },
      },
      requiredStrings: [
        { key: "nested.label", description: "A label", default: "hello" },
      ],
    });
    const view = MCPServerViewTypeFactory.build();

    expect(getDefaultAdditionalConfiguration(view)).toEqual({
      "nested.flag": false,
      mode: "fast",
      "nested.label": "hello",
    });
    // The builder nests the same defaults, which its save flattens back to the stored form.
    expect(
      processAdditionalConfiguration(
        getDefaultConfiguration(view).additionalConfiguration
      )
    ).toEqual(getDefaultAdditionalConfiguration(view));
  });

  it("names the action after the tool, unique among the taken names", () => {
    const view = MCPServerViewTypeFactory.build({ name: "Ticket Tracker" });

    expect(
      getDefaultMCPActionPayload(view, {
        takenNames: new Set(["ticket_tracker", "ticket_tracker_2"]),
      })
    ).toMatchObject({
      type: "mcp_server_configuration",
      mcpServerViewId: view.sId,
      name: "ticket_tracker_3",
      description: "Test server description",
      dataSources: null,
      childAgentId: null,
    });
  });

  it("falls back to default descriptions where the builder leaves them empty", () => {
    mockGetMCPServerRequirements.mockReturnValue({
      ...NO_REQUIREMENTS,
      requiresDataSourceConfiguration: true,
      noRequirement: false,
    });
    const view = MCPServerViewTypeFactory.build();

    // The builder asks for a description of the knowledge instead.
    expect(getDefaultMCPActionDescription(view)).toBe("");
    expect(
      getDefaultMCPActionPayload(view, { takenNames: new Set() }).description
    ).toBe(DEFAULT_MCP_ACTION_DESCRIPTION);
  });
});
