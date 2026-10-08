import { redeemLiveTicket } from "@app/lib/api/collab/tickets";
import { DustFileSystem, DustFileSystemError } from "@app/lib/api/file_system";
import { WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES } from "@app/lib/api/files/file_system_ops";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { writeUserFile } from "@app/tests/utils/user_files";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
});

const post = (workspaceId: string, filePath: string) =>
  honoApp.request(`/api/w/${workspaceId}/files/collab-tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath }),
  });

describe("POST /api/w/:wId/files/collab-tickets", () => {
  it("returns a ticket for the signed-in user and the file", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");
    const filePath = await writeUserFile(auth, "notes.md", "# Notes\n");

    const response = await post(workspace.sId, filePath);

    expect(response.status).toBe(200);
    const { ticket } = await response.json();
    expect(await redeemLiveTicket(ticket)).toEqual({
      workspaceId: workspace.sId,
      userId: user.sId,
      canonicalPath: filePath,
    });
  });

  it("refuses without co_edition", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    const filePath = await writeUserFile(auth, "notes.md", "# Notes\n");

    const response = await post(workspace.sId, filePath);

    expect(response.status).toBe(403);
  });

  it("refuses a workspace in maintenance", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");
    const filePath = await writeUserFile(auth, "notes.md", "# Notes\n");
    await WorkspaceResource.updateMetadata(workspace.id, {
      maintenance: "relocation",
    });

    const response = await post(workspace.sId, filePath);

    expect(response.status).toBe(503);
    expect((await response.json()).error.type).toBe("service_unavailable");
  });

  it("refuses a file that is not Markdown", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");
    const filePath = await writeUserFile(
      auth,
      "notes.txt",
      "Hi.\n",
      "text/plain"
    );

    const response = await post(workspace.sId, filePath);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("file_type_not_supported");
  });

  it("refuses a file too large to edit live", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");
    const filePath = await writeUserFile(auth, "notes.md", "# Notes\n");
    vi.spyOn(DustFileSystem.prototype, "stat").mockResolvedValue(
      new Ok({
        contentType: "text/markdown",
        sizeBytes: WRITE_CANONICAL_FILE_CONTENT_MAX_BYTES + 1,
      })
    );

    const response = await post(workspace.sId, filePath);

    expect(response.status).toBe(413);
    expect((await response.json()).error.type).toBe("file_too_large");
  });

  it("refuses a file the user can only read", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");
    const filePath = await writeUserFile(auth, "notes.md", "# Notes\n");
    vi.spyOn(DustFileSystem.prototype, "checkWriteAccess").mockReturnValue(
      new Err(new DustFileSystemError("internal", "Read-only mount."))
    );

    const response = await post(workspace.sId, filePath);

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("file_read_only");
  });

  it("refuses a missing file", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");
    fileStorageMock.setFileExists(
      (filePath) => !filePath.endsWith("missing.md")
    );

    const response = await post(workspace.sId, `user-${user.sId}/missing.md`);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("file_not_found");
  });
});
