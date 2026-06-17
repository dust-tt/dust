import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/share`;
}

function postShareScope(
  workspace: { sId: string },
  fileId: string,
  body: unknown
) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("share endpoint", () => {
  it("blocks a non-owner workspace member from updating a frame share scope", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test-frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
    });
    const initialShareInfo = await file.getShareInfo();

    await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
      workspace,
    });

    const response = await postShareScope(workspace, file.sId, {
      shareScope: "public",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).api_error).toMatchObject({
      type: "workspace_auth_error",
    });
    expect((await file.getShareInfo())?.scope).toBe(initialShareInfo?.scope);
  });
});
