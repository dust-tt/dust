import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { buildDiscoverToolsInstructions } from "@app/lib/resources/skill/global/discover_tools";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("buildDiscoverToolsInstructions", () => {
  let testContext: Awaited<ReturnType<typeof createResourceTest>>;

  beforeEach(async () => {
    testContext = await createResourceTest({ role: "admin" });
  });

  async function createToolset(
    name: string,
    description: string
  ): Promise<MCPServerViewResource> {
    const space = await SpaceFactory.regular(testContext.workspace);
    await GroupSpaceFactory.associate(space, testContext.globalGroup);

    const server = await RemoteMCPServerFactory.create(testContext.workspace, {
      name,
      description,
    });

    return MCPServerViewFactory.create(
      testContext.workspace,
      server.sId,
      space
    );
  }

  describe("sorting behavior", () => {
    it("should sort toolsets by display name alphabetically", async () => {
      const toolsets = [
        await createToolset("Zebra Tool", "Description Z"),
        await createToolset("Alpha Tool", "Description A"),
        await createToolset("Middle Tool", "Description M"),
      ];

      const result = buildDiscoverToolsInstructions(toolsets);

      const alphaIndex = result.indexOf("Alpha Tool");
      const middleIndex = result.indexOf("Middle Tool");
      const zebraIndex = result.indexOf("Zebra Tool");

      expect(alphaIndex).toBeLessThan(middleIndex);
      expect(middleIndex).toBeLessThan(zebraIndex);
    });

    it("should use sId as tie-breaker when display names are equal", async () => {
      // Create toolsets with the same name.
      const toolsets = [
        await createToolset("Same Name", "Description 1"),
        await createToolset("Same Name", "Description 2"),
        await createToolset("Same Name", "Description 3"),
      ];

      const result = buildDiscoverToolsInstructions(toolsets);

      // Extract sIds and their positions in the output.
      const sIds = toolsets.map((t) => t.sId);
      const sortedSIds = [...sIds].sort((a, b) => a.localeCompare(b));

      // Verify they appear in alphabetical order by sId.
      const positions = sortedSIds.map((sId) => result.indexOf(sId));
      for (let i = 0; i < positions.length - 1; i++) {
        expect(positions[i]).toBeLessThan(positions[i + 1]);
      }
    });

    it("should produce deterministic output for toolsets with same display name", async () => {
      const toolsets = [
        await createToolset("Pd Connect", "Description 1"),
        await createToolset("Pd Connect", "Description 2"),
        await createToolset("Pd Connect", "Description 3"),
      ];

      // Run the function multiple times to verify deterministic output.
      const results = Array.from({ length: 5 }, () =>
        buildDiscoverToolsInstructions(toolsets)
      );

      // All results should be identical.
      for (const result of results) {
        expect(result).toBe(results[0]);
      }
    });

    it("should handle mixed sorting with both different and same display names", async () => {
      const alpha1 = await createToolset("Alpha", "A1 description");
      const alpha2 = await createToolset("Alpha", "A2 description");
      const beta = await createToolset("Beta", "B description");
      const zebra = await createToolset("Zebra", "Z description");

      const toolsets = [zebra, alpha2, alpha1, beta];

      const result = buildDiscoverToolsInstructions(toolsets);

      // Get positions.
      const alpha1Pos = result.indexOf(alpha1.sId);
      const alpha2Pos = result.indexOf(alpha2.sId);
      const betaPos = result.indexOf(beta.sId);
      const zebraPos = result.indexOf(zebra.sId);

      // Both Alphas should come before Beta.
      expect(Math.max(alpha1Pos, alpha2Pos)).toBeLessThan(betaPos);
      // Beta before Zebra.
      expect(betaPos).toBeLessThan(zebraPos);

      // Within Alphas, the one with smaller sId should come first.
      const sortedAlphaSIds = [alpha1.sId, alpha2.sId].sort((a, b) =>
        a.localeCompare(b)
      );
      const firstAlphaPos = result.indexOf(sortedAlphaSIds[0]);
      const secondAlphaPos = result.indexOf(sortedAlphaSIds[1]);
      expect(firstAlphaPos).toBeLessThan(secondAlphaPos);
    });
  });

  describe("output format", () => {
    it("should return empty toolsets message when no toolsets provided", () => {
      const result = buildDiscoverToolsInstructions([]);

      expect(result).toContain(
        "No additional toolsets are currently available."
      );
    });

    it("should format toolset entries correctly", async () => {
      const toolset = await createToolset("Test Tool", "A test description");

      const result = buildDiscoverToolsInstructions([toolset]);

      expect(result).toContain("**Test Tool**");
      expect(result).toContain(`(toolsetId: \`${toolset.sId}\`)`);
      expect(result).toContain("A test description");
    });

    it("should include available_toolsets XML tags", async () => {
      const toolset = await createToolset("Tool", "Description");

      const result = buildDiscoverToolsInstructions([toolset]);

      expect(result).toContain("<available_toolsets>");
      expect(result).toContain("</available_toolsets>");
    });
  });
});
