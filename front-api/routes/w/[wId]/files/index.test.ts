import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function postFile(workspaceSId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${workspaceSId}/files`, {
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
