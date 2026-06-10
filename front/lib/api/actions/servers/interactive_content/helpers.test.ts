import { getPodFrameLinkNotice } from "@app/lib/api/actions/servers/interactive_content/helpers";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType } from "@app/types/files";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getAppUrl: vi.fn(() => "https://app.dust.tt"),
  },
}));

describe("getPodFrameLinkNotice", () => {
  it("returns a Pod files tab link for project_context files", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const user = auth.getNonNullableUser();
    const space = await SpaceFactory.project(workspace, user.id);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "Chart.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    expect(getPodFrameLinkNotice(auth, file)).toContain(
      `https://app.dust.tt/w/${workspace.sId}/pods/${space.sId}#files`
    );
  });

  it("returns an empty string for conversation files", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });
    const user = auth.getNonNullableUser();

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "Chart.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "cId" },
    });

    expect(getPodFrameLinkNotice(auth, file)).toBe("");
  });
});
