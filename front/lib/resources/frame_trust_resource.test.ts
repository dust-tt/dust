import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FrameTrustResource } from "@app/lib/resources/frame_trust_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { createTestFrameFile } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { beforeEach, describe, expect, it } from "vitest";

describe("FrameTrustResource", () => {
  let publisher: UserResource;
  let viewer: UserResource;
  let viewerAuth: Authenticator;
  let frame: FileResource;
  let otherFrame: FileResource;

  beforeEach(async () => {
    const {
      authenticator: publisherAuth,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    publisher = user;

    viewer = await UserFactory.basic();
    await MembershipFactory.associate(workspace, viewer, { role: "user" });
    viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      viewer.sId,
      workspace.sId
    );

    frame = await createTestFrameFile(publisherAuth, {
      space: await SpaceFactory.project(workspace),
    });
    otherFrame = await createTestFrameFile(publisherAuth, {
      space: await SpaceFactory.project(workspace),
    });
  });

  it("is trusted only for the granted frame and publisher", async () => {
    expect(
      await FrameTrustResource.isTrusted(viewerAuth, {
        frame,
        publisherUserModelId: publisher.id,
      })
    ).toBe(false);

    await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: publisher.id,
    });

    expect(
      await FrameTrustResource.isTrusted(viewerAuth, {
        frame,
        publisherUserModelId: publisher.id,
      })
    ).toBe(true);
    expect(
      await FrameTrustResource.isTrusted(viewerAuth, {
        frame: otherFrame,
        publisherUserModelId: publisher.id,
      })
    ).toBe(false);
    expect(
      await FrameTrustResource.isTrusted(viewerAuth, {
        frame,
        publisherUserModelId: viewer.id,
      })
    ).toBe(false);
  });

  it("grants idempotently", async () => {
    const first = await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: publisher.id,
    });
    const second = await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: publisher.id,
    });

    expect(second.id).toBe(first.id);
  });

  it("deletes the rows where the user is the viewer or the publisher", async () => {
    await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: publisher.id,
    });

    expect(
      await FrameTrustResource.deleteAllForUser(viewerAuth, publisher)
    ).toBe(1);
    expect(
      await FrameTrustResource.isTrusted(viewerAuth, {
        frame,
        publisherUserModelId: publisher.id,
      })
    ).toBe(false);
  });

  it("deletes the rows of a frame", async () => {
    await FrameTrustResource.grant(viewerAuth, {
      frame,
      publisherUserModelId: publisher.id,
    });
    await FrameTrustResource.grant(viewerAuth, {
      frame: otherFrame,
      publisherUserModelId: publisher.id,
    });

    expect(await FrameTrustResource.deleteAllForFrame(viewerAuth, frame)).toBe(
      1
    );
    expect(
      await FrameTrustResource.isTrusted(viewerAuth, {
        frame: otherFrame,
        publisherUserModelId: publisher.id,
      })
    ).toBe(true);
  });
});
