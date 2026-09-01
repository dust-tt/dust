import {
  getConvertedFrameMetadata,
  getFrameSourceOwner,
} from "@app/lib/api/frames/conversion_primitives";
import { describe, expect, it } from "vitest";

describe("Frame conversion primitives", () => {
  it("maps supported source scopes to FileResource ownership", () => {
    expect(getFrameSourceOwner("conversation-conv/Status")).toMatchObject({
      key: "conversation:conv",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "conv" },
    });
    expect(getFrameSourceOwner("pod-space/Status")).toMatchObject({
      key: "pod:space",
      useCase: "project_context",
      useCaseMetadata: { spaceId: "space" },
    });
    expect(getFrameSourceOwner("user-user/Status")).toBeNull();
  });

  it("keeps stable metadata while replacing source and runtime ownership", () => {
    const owner = getFrameSourceOwner("conversation-next/Status");
    expect(owner).not.toBeNull();
    if (!owner) {
      return;
    }

    expect(
      getConvertedFrameMetadata(
        {
          activePublicationId: "publication",
          conversationId: "previous",
          frameBundleRootPath: "previous/root",
          frameEntryRelPath: "index.tsx",
          skillId: "skill",
        },
        owner
      )
    ).toEqual({ conversationId: "next", skillId: "skill" });
  });
});
