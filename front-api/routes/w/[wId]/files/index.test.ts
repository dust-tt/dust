import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE } from "@app/lib/workspace_policies";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function postFile(workspaceId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${workspaceId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/files — workspace_branding", () => {
  it("returns 200 for a logo upload", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await postFile(workspace.sId, {
      contentType: "image/png",
      fileName: "logo.png",
      fileSize: 10000,
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "logo" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.file).toBeDefined();
    expect(body.file.useCase).toBe("workspace_branding");
  });

  it("returns 200 for a favicon upload", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await postFile(workspace.sId, {
      contentType: "image/png",
      fileName: "favicon.png",
      fileSize: 5000,
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "favicon" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.file).toBeDefined();
  });

  it("returns 200 for an SVG logo upload", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await postFile(workspace.sId, {
      contentType: "image/svg+xml",
      fileName: "logo.svg",
      fileSize: 8000,
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "logo" },
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when useCaseMetadata is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await postFile(workspace.sId, {
      contentType: "image/png",
      fileName: "logo.png",
      fileSize: 10000,
      useCase: "workspace_branding",
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid asset value", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await postFile(workspace.sId, {
      contentType: "image/png",
      fileName: "logo.png",
      fileSize: 10000,
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "banner" },
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for an unsupported content type", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const res = await postFile(workspace.sId, {
      contentType: "text/plain",
      fileName: "logo.txt",
      fileSize: 100,
      useCase: "workspace_branding",
      useCaseMetadata: { asset: "logo" },
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/w/:wId/files — audio", () => {
  it("returns 200 when voice transcription is available", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const res = await postFile(workspace.sId, {
      contentType: "audio/mpeg",
      fileName: "meeting.mp3",
      fileSize: 10000,
      useCase: "conversation",
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when the workspace disabled voice transcription", async () => {
    const workspace = await WorkspaceFactory.basic();
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowVoiceTranscription: false,
    });

    await createPrivateApiMockRequest({ role: "user", workspace });

    const res = await postFile(workspace.sId, {
      contentType: "audio/mpeg",
      fileName: "meeting.mp3",
      fileSize: 10000,
      useCase: "conversation",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe("file_type_not_supported");
    expect(body.error.message).toBe(AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE);
  });

  it("returns 400 for a BYOK workspace", async () => {
    const workspace = await WorkspaceFactory.byok();

    await createPrivateApiMockRequest({ role: "user", workspace });

    const res = await postFile(workspace.sId, {
      contentType: "audio/mpeg",
      fileName: "meeting.mp3",
      fileSize: 10000,
      useCase: "conversation",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe(AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE);
  });

  it("still accepts a non-audio file when transcription is unavailable", async () => {
    const workspace = await WorkspaceFactory.byok();

    await createPrivateApiMockRequest({ role: "user", workspace });

    const res = await postFile(workspace.sId, {
      contentType: "text/plain",
      fileName: "transcript.txt",
      fileSize: 100,
      useCase: "conversation",
    });

    expect(res.status).toBe(200);
  });
});
