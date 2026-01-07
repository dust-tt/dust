import { describe, expect, it } from "vitest";

import { ConversationModel } from "@app/lib/models/agent/conversation";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe("PostgreSQL BIGINT type parser", () => {
  it("parses spaceId as number from ConversationModel", async () => {
    const workspace = await WorkspaceFactory.basic();
    const space = await SpaceFactory.regular(workspace);

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: "test-conversation-bigint-single",
      spaceId: space.id,
      requestedSpaceIds: [],
    });

    const fetched = await ConversationModel.findByPk(conversation.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.spaceId).toBe(space.id);
    expect(typeof fetched!.spaceId).toBe("number");
  });

  it("parses requestedSpaceIds as number array from ConversationModel", async () => {
    const workspace = await WorkspaceFactory.basic();
    const space1 = await SpaceFactory.regular(workspace);
    const space2 = await SpaceFactory.regular(workspace);
    const spaceIds = [space1.id, space2.id];

    const conversation = await ConversationModel.create({
      workspaceId: workspace.id,
      sId: "test-conversation-bigint-array",
      spaceId: null,
      requestedSpaceIds: spaceIds,
    });

    const fetched = await ConversationModel.findByPk(conversation.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.requestedSpaceIds).toEqual(spaceIds);
    expect(fetched!.requestedSpaceIds.every((v) => typeof v === "number")).toBe(
      true
    );
  });
});
