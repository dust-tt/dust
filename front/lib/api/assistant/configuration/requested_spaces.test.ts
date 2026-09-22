import { resolveAgentRequestedSpaces } from "@app/lib/api/assistant/configuration/requested_spaces";
import { makeSId } from "@app/lib/resources/string_ids";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

describe("resolveAgentRequestedSpaces", () => {
  it("rejects a space the caller cannot read and an aliased id", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "user",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const aliasedId = makeSId("data_source_view", {
      id: globalSpace.id,
      workspaceId: workspace.id,
    });

    const result = await resolveAgentRequestedSpaces(authenticator, {
      capabilitySpaces: [restrictedSpace],
      requestedSpaceIds: [globalSpace.sId, aliasedId, "vlt"],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        `User does not have access to the following spaces: ${restrictedSpace.sId}, ${aliasedId}, vlt`
      );
    }
  });

  it("drops aliased ids but keeps unreadable spaces when permission filtering is skipped", async () => {
    const { authenticator, workspace, globalSpace } = await createResourceTest({
      role: "user",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const aliasedId = makeSId("data_source_view", {
      id: globalSpace.id,
      workspaceId: workspace.id,
    });

    const result = await resolveAgentRequestedSpaces(authenticator, {
      capabilitySpaces: [restrictedSpace],
      requestedSpaceIds: [globalSpace.sId, aliasedId, "not_a_space", "vlt"],
      dangerouslySkipPermissionFiltering: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((space) => space.sId).sort()).toEqual(
        [restrictedSpace.sId, globalSpace.sId].sort()
      );
    }
  });
});
