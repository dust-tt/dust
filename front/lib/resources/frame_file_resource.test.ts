import { FileFactory } from "@app/tests/utils/FileFactory";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameV2ContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

describe("Frames v2 FileResource", () => {
  it("identifies a manifest FileResource by its content type", async () => {
    const { authenticator } = await createResourceTest({});
    const frame = await FileFactory.create(authenticator, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
    });

    expect(frame.isFrameV2).toBe(true);
    expect(frame.isInteractiveContent).toBe(false);
    expect(frame.isShareableFrame).toBe(true);
  });
});

describe("Frames v2 FileResource - hasActiveFrameFunctions", () => {
  it("returns true when the active publication declares a function", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    const space = await SpaceFactory.project(workspace, user.id);
    const { frame } = await createTestFrameFunction(authenticator, { space });

    expect(await frame.hasActiveFrameFunctions()).toBe(true);
  });

  it("returns false when only a superseded publication declares a function", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    const space = await SpaceFactory.project(workspace, user.id);
    const { frame } = await createTestFrameFunction(authenticator, { space });
    await frame.setUseCaseMetadata(authenticator, {
      ...frame.useCaseMetadata,
      activePublicationId: "publication-2",
    });

    expect(await frame.hasActiveFrameFunctions()).toBe(false);
  });

  it("returns false for a Frame declaring no function", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    const space = await SpaceFactory.project(workspace, user.id);
    const frame = await FileFactory.create(authenticator, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: space.sId,
        activePublicationId: "publication-1",
      },
    });

    expect(await frame.hasActiveFrameFunctions()).toBe(false);
  });

  it("returns false for a Frame with no active publication", async () => {
    const { authenticator, user, workspace } = await createResourceTest({});
    const space = await SpaceFactory.project(workspace, user.id);
    const { frame } = await createTestFrameFunction(authenticator, { space });
    await frame.setUseCaseMetadata(authenticator, { spaceId: space.sId });

    expect(await frame.hasActiveFrameFunctions()).toBe(false);
  });
});
