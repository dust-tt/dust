import type {
  LightServerSideMCPToolConfigurationType,
  ServerSideMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { InternalMCPToolNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isLightServerSideMCPToolConfigurationWithName,
  isServerSideMCPToolConfigurationWithName,
} from "@app/lib/actions/types/guards";
import { describe, expectTypeOf, it } from "vitest";

function assertServerSideToolNameNarrowing(
  tool: ServerSideMCPToolConfigurationType
) {
  if (isServerSideMCPToolConfigurationWithName(tool, "gmail")) {
    expectTypeOf(tool.name).toEqualTypeOf<InternalMCPToolNameType<"gmail">>();
    expectTypeOf(tool.originalName).toEqualTypeOf<
      InternalMCPToolNameType<"gmail">
    >();
  }

  if (isServerSideMCPToolConfigurationWithName(tool, "search")) {
    expectTypeOf(tool.name).toEqualTypeOf<InternalMCPToolNameType<"search">>();
  }

  if (isServerSideMCPToolConfigurationWithName(tool, "run_agent")) {
    expectTypeOf(tool.name).toEqualTypeOf<
      InternalMCPToolNameType<"run_agent">
    >();
  }
}

function assertLightServerSideToolNameNarrowing(
  tool: LightServerSideMCPToolConfigurationType
) {
  if (isLightServerSideMCPToolConfigurationWithName(tool, "search")) {
    expectTypeOf(tool.name).toEqualTypeOf<InternalMCPToolNameType<"search">>();
  }
}

describe("MCP tool config guards", () => {
  it("narrows internal tool names from the internal server name", () => {
    expectTypeOf(assertServerSideToolNameNarrowing).toBeFunction();
    expectTypeOf(assertLightServerSideToolNameNarrowing).toBeFunction();
  });
});
