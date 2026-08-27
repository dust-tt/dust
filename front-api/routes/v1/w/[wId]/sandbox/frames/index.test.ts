import { FileResource } from "@app/lib/resources/file_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";

function requestFrameLifecycle(
  workspaceId: string,
  token: string,
  body: { action: "register" | "publish"; manifestPath: string }
) {
  return honoApp.request(`/api/v1/w/${workspaceId}/sandbox/frames`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const context = await createSandboxTokenTestContext();
  await FeatureFlagFactory.basic(context.auth, "frames_v2");
  const sourceDirectoryPath = `conversation-${context.conversation.sId}/Status`;
  const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const mountDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: context.workspace.sId,
    conversationId: context.conversation.sId,
  })}Status`;
  const sourceByPath = new Map([
    [`${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
    [`${mountDirectoryPath}/index.tsx`, uiSource],
  ]);
  fileStorageMock.setFileContent((path) => sourceByPath.get(path) ?? null);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${mountDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".tsx")
              ? "text/typescript"
              : "application/json",
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );

  return { ...context, manifestPath };
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("POST /api/v1/w/[wId]/sandbox/frames", () => {
  it("registers and publishes through the sandbox token", async () => {
    const context = await setup();

    const registerResponse = await requestFrameLifecycle(
      context.workspace.sId,
      context.token,
      { action: "register", manifestPath: context.manifestPath }
    );
    expect(registerResponse.status).toBe(200);
    const registered = await registerResponse.json();
    expect(registered.frameId).toMatch(/^fil_/);
    expect(registered.created).toBe(true);

    const publishResponse = await requestFrameLifecycle(
      context.workspace.sId,
      context.token,
      { action: "publish", manifestPath: context.manifestPath }
    );
    expect(publishResponse.status).toBe(200);
    const published = await publishResponse.json();
    expect(published.frameId).toBe(registered.frameId);
    expect(published.created).toBe(false);
    expect(published.publicationId).toBeTypeOf("string");

    const frame = await FileResource.fetchById(context.auth, published.frameId);
    expect(frame?.useCaseMetadata?.activePublicationId).toBe(
      published.publicationId
    );
  });

  it("refuses the lifecycle endpoint without the feature flag", async () => {
    const context = await createSandboxTokenTestContext();

    const response = await requestFrameLifecycle(
      context.workspace.sId,
      context.token,
      {
        action: "register",
        manifestPath: `conversation-${context.conversation.sId}/Status/${FRAME_MANIFEST_FILE}`,
      }
    );

    expect(response.status).toBe(403);
  });
});
