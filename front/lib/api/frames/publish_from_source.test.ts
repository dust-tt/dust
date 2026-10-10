// @vitest-environment node

import { getFrameSourceLockName } from "@app/lib/api/frames/operation_lock";
import {
  publishFrameFromSource,
  publishFrameV2FromSource,
} from "@app/lib/api/frames/publish_from_source";
import { getRedisStreamClient } from "@app/lib/api/redis";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import { FramePublicationDescriptorSchema } from "@app/types/api/frame_publication";
import { getFramePublicationDescriptorPath } from "@app/types/api/frame_storage";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import { SANDBOX_POLICY_MAX_REQUESTED_DOMAINS } from "@app/types/sandbox/egress_policy";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";
const functionManifest = JSON.stringify({
  version: 1,
  description: "Run a function.",
  functions: [
    { name: "run", description: "Run it.", entryPoint: "functions/run.ts" },
  ],
});
const functionSources = {
  "functions/run.ts":
    "export default { fetch: async () => Response.json({}) };",
};

async function setup({
  uiContentType = "text/typescript",
  manifestContent = manifest,
  extraSources = {},
}: {
  uiContentType?: string;
  manifestContent?: string;
  extraSources?: Record<string, string>;
} = {}) {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
  const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const gcsSourceDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  })}Status`;
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifestContent),
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });

  stageFrameSource({
    gcsSourceDirectoryPath,
    manifestContent,
    uiContentType,
    extraSources,
  });

  return {
    auth,
    conversation,
    frame,
    gcsSourceDirectoryPath,
    manifestPath,
    workspace,
  };
}

// Serves a Frame folder (manifest + index.tsx) from the mocked source bucket.
function stageFrameSource({
  gcsSourceDirectoryPath,
  manifestContent,
  uiContentType = "text/typescript",
  extraSources = {},
}: {
  gcsSourceDirectoryPath: string;
  manifestContent: string;
  uiContentType?: string;
  extraSources?: Record<string, string>;
}) {
  const sourceByPath = new Map([
    [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifestContent],
    [`${gcsSourceDirectoryPath}/index.tsx`, uiSource],
    ...Object.entries(extraSources).map(
      ([relativePath, content]): [string, string] => [
        `${gcsSourceDirectoryPath}/${relativePath}`,
        content,
      ]
    ),
  ]);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${gcsSourceDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".tsx")
              ? uiContentType
              : frameV2ContentType,
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );
  fileStorageMock.setFileContent(
    (filePath) => sourceByPath.get(filePath) ?? null
  );
  // Egress policy files are absent until written, so domain requests start
  // from an empty policy instead of the mock's placeholder content.
  fileStorageMock.setFetchFileContentNotFound(
    (filePath) =>
      filePath.endsWith("/sandbox-egress-policy.json") ||
      /\/sandboxes\/[^/]+\.json$/.test(filePath)
  );
}

const manifestWithDomains = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
  domains: ["API.Stripe.COM", "*.stripe.com"],
});

function requestedDomainsAt(policyPath: string): string[] {
  const policy = JSON.parse(fileStorageMock.getObject(policyPath) ?? "{}");
  return (policy.requestedDomains ?? []).map(
    (request: { domain: string }) => request.domain
  );
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("publishFrameFromSource", () => {
  it("registers and publishes a v2 Frame that has no prior identity", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const sourceDirectoryPath = `conversation-${conversation.sId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const gcsSourceDirectoryPath = `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Status`;
    const sourceByPath = new Map([
      [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
      [`${gcsSourceDirectoryPath}/index.tsx`, uiSource],
    ]);
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === `${gcsSourceDirectoryPath}/`
        ? [...sourceByPath.entries()].map(([name, content]) => ({
            name,
            metadata: {
              contentType: name.endsWith(".tsx")
                ? "text/typescript"
                : frameV2ContentType,
              size: String(Buffer.byteLength(content)),
            },
          }))
        : null
    );
    fileStorageMock.setFileContent(
      (filePath) => sourceByPath.get(filePath) ?? null
    );

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
    });

    assert(result.isOk());
    expect(result.value).toMatchObject({
      kind: "v2",
      sourcePath: manifestPath,
      created: true,
    });
    const frame = await FileResource.fetchById(auth, result.value.frameId);
    expect(frame?.isFrameV2).toBe(true);
    expect(frame?.useCaseMetadata?.activePublicationId).toBe(
      result.value.kind === "v2" ? result.value.publicationId : undefined
    );
  });

  it("rejects a Frame outside the signed conversation scope", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const sourcePath = `conversation-${otherConversation.sId}/Legacy.tsx`;
    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Legacy.tsx",
      fileSize: Buffer.byteLength(uiSource),
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: otherConversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: workspace.sId,
        conversationId: otherConversation.sId,
      })}Legacy.tsx`,
    });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_path",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("rejects a legacy Frame in a read-only Pod", async () => {
    const {
      authenticator: auth,
      globalGroup,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const space = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(space, globalGroup, "project_viewer");
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    assert(viewerAuth);
    expect(viewerAuth.can("read", space)).toBe(true);
    expect(viewerAuth.can("write", space)).toBe(false);

    const conversation = await ConversationFactory.create(viewerAuth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      spaceId: space.id,
    });
    const sourcePath = `pod-${space.sId}/Legacy.tsx`;
    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Legacy.tsx",
      fileSize: Buffer.byteLength(uiSource),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: space.sId,
      })}Legacy.tsx`,
    });

    const result = await publishFrameFromSource(viewerAuth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "unauthorized",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("files declared domains as workspace requests for a Frame outside a Pod", async () => {
    const { auth, conversation, manifestPath, workspace } = await setup({
      manifestContent: manifestWithDomains,
    });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
    });

    assert(result.isOk());
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toEqual({
      kind: "filed",
      scope: "workspace",
      requested: ["api.stripe.com", "*.stripe.com"],
      alreadyAllowed: [],
    });
    expect(
      requestedDomainsAt(`w/${workspace.sId}/sandbox-egress-policy.json`)
    ).toEqual(["api.stripe.com", "*.stripe.com"]);
  });

  it("files declared domains as Pod requests for a Frame in a Pod", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspace = auth.getNonNullableWorkspace();
    const sourceDirectoryPath = `pod-${projectId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const gcsSourceDirectoryPath = `${getPodFilesBasePath({
      workspaceId: workspace.sId,
      podId: projectId,
    })}Status`;
    await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifestWithDomains),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: projectId },
      mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    });
    stageFrameSource({
      gcsSourceDirectoryPath,
      manifestContent: manifestWithDomains,
    });
    // The workspace layer applies to Pod sandboxes too, so a domain it
    // already allows must not become a redundant Pod request.
    const workspacePolicyPath = `w/${workspace.sId}/sandbox-egress-policy.json`;
    fileStorageMock.setObject(
      workspacePolicyPath,
      JSON.stringify({ allowedDomains: ["api.stripe.com"] })
    );

    const result = await publishFrameFromSource(auth, {
      conversation: conversation.toJSON(),
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
    });

    assert(result.isOk());
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toEqual({
      kind: "filed",
      scope: "pod",
      requested: ["*.stripe.com"],
      alreadyAllowed: ["api.stripe.com"],
    });
    expect(
      requestedDomainsAt(`w/${workspace.sId}/sandboxes/${projectId}.json`)
    ).toEqual(["*.stripe.com"]);
    expect(requestedDomainsAt(workspacePolicyPath)).toEqual([]);
  });

  it("reports domains the workspace already allows without re-requesting them", async () => {
    const { auth, conversation, manifestPath, workspace } = await setup({
      manifestContent: manifestWithDomains,
    });
    const policyPath = `w/${workspace.sId}/sandbox-egress-policy.json`;
    fileStorageMock.setObject(
      policyPath,
      JSON.stringify({ allowedDomains: ["api.stripe.com"] })
    );

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
    });

    assert(result.isOk());
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toEqual({
      kind: "filed",
      scope: "workspace",
      requested: ["*.stripe.com"],
      alreadyAllowed: ["api.stripe.com"],
    });
    expect(requestedDomainsAt(policyPath)).toEqual(["*.stripe.com"]);
  });

  it("publishes but reports the domains as failed when the scope is at its pending cap", async () => {
    const { auth, conversation, manifestPath, workspace } = await setup({
      manifestContent: manifestWithDomains,
    });
    const policyPath = `w/${workspace.sId}/sandbox-egress-policy.json`;
    fileStorageMock.setObject(
      policyPath,
      JSON.stringify({
        allowedDomains: [],
        requestedDomains: Array.from(
          { length: SANDBOX_POLICY_MAX_REQUESTED_DOMAINS },
          (_, index) => ({
            domain: `service-${index}.example.com`,
            requestedAtMs: 1,
          })
        ),
      })
    );

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
    });

    assert(result.isOk());
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toMatchObject({
      kind: "failed",
      domains: ["api.stripe.com", "*.stripe.com"],
      message: expect.stringContaining("pending domain requests"),
    });
    expect(requestedDomainsAt(policyPath)).toHaveLength(
      SANDBOX_POLICY_MAX_REQUESTED_DOMAINS
    );
  });

  it("reports no domain requests when the manifest declares none", async () => {
    const { auth, conversation, manifestPath } = await setup();

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
    });

    assert(result.isOk());
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toBeNull();
  });
});

// "pod-conversation" places the legacy Frame on the conversation mount of a
// Pod conversation — the mount agents normally author on inside a Pod.
type LegacyFrameReplacementScope = "conversation" | "pod" | "pod-conversation";

async function setupLegacyFrameReplacement({
  scope,
  replacementUiSource = uiSource,
  manifestContent = manifest,
}: {
  scope: LegacyFrameReplacementScope;
  replacementUiSource?: string;
  manifestContent?: string;
}) {
  const {
    authenticator: auth,
    user,
    workspace,
  } = await createResourceTest({ role: "admin" });
  const pod =
    scope === "conversation"
      ? null
      : await SpaceFactory.project(workspace, user.id);
  const podAuth = pod
    ? await Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId)
    : auth;
  assert(podAuth, "Pod authenticator not found");
  const conversation = await ConversationFactory.create(podAuth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
    spaceId: pod?.id,
  });

  const onPodMount = scope === "pod";
  const scopedRoot = onPodMount
    ? `pod-${pod?.sId}`
    : `conversation-${conversation.sId}`;
  const gcsRoot =
    onPodMount && pod
      ? getPodFilesBasePath({ workspaceId: workspace.sId, podId: pod.sId })
      : getConversationFilesBasePath({
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        });
  const legacyPath = `${scopedRoot}/dashboards/Sales.tsx`;
  const manifestPath = `${scopedRoot}/dashboards/Sales/${FRAME_MANIFEST_FILE}`;
  const gcsSourceDirectoryPath = `${gcsRoot}dashboards/Sales`;

  const legacyFrame = await FileFactory.create(podAuth, null, {
    contentType: frameContentType,
    fileName: "Sales.tsx",
    fileSize: Buffer.byteLength(uiSource),
    status: "created",
    useCase: onPodMount ? "project_context" : "conversation",
    useCaseMetadata:
      onPodMount && pod
        ? { spaceId: pod.sId }
        : { conversationId: conversation.sId },
    mountFilePath: `${gcsRoot}dashboards/Sales.tsx`,
  });
  await legacyFrame.ensureShareableFrame(podAuth);
  const legacyGcsPath = `${gcsRoot}dashboards/Sales.tsx`;
  fileStorageMock.setObject(legacyGcsPath, uiSource);

  const sourceByPath = new Map([
    [`${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifestContent],
    [`${gcsSourceDirectoryPath}/index.tsx`, replacementUiSource],
    [`${gcsSourceDirectoryPath}/theme.ts`, "export const theme = {};"],
  ]);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${gcsSourceDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".json")
              ? frameV2ContentType
              : "text/typescript",
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );
  fileStorageMock.setFileContent(
    (filePath) => sourceByPath.get(filePath) ?? null
  );
  // Egress policy files are absent until written, so domain requests start
  // from an empty policy instead of the mock's placeholder content.
  fileStorageMock.setFetchFileContentNotFound(
    (filePath) =>
      filePath.endsWith("/sandbox-egress-policy.json") ||
      /\/sandboxes\/[^/]+\.json$/.test(filePath)
  );

  return {
    auth: podAuth,
    conversation,
    legacyFrame,
    legacyGcsPath,
    legacyPath,
    manifestPath,
    pod,
    workspace,
  };
}

describe("publishFrameFromSource replacing a legacy Frame", () => {
  it("keeps the legacy Frame's id and share link", async () => {
    const { auth, conversation, legacyFrame, legacyPath, manifestPath } =
      await setupLegacyFrameReplacement({ scope: "conversation" });
    const legacyShare = await legacyFrame.getShareInfo();
    assert(legacyShare, "Legacy Frame is not shared");

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    assert(result.isOk(), "Replacement publish failed");
    expect(result.value).toMatchObject({
      kind: "v2",
      frameId: legacyFrame.sId,
      sourcePath: manifestPath,
    });
    const frame = await FileResource.fetchById(auth, legacyFrame.sId);
    assert(frame, "Frame not found");
    expect(frame.isFrameV2).toBe(true);
    expect(frame.toScopedPath(auth)).toBe(manifestPath);
    expect(frame.useCaseMetadata?.activePublicationId).toBe(
      result.value.kind === "v2" ? result.value.publicationId : undefined
    );
    const share = await frame.getShareInfo();
    expect(share?.shareUrl).toBe(legacyShare.shareUrl);
  });

  it("deletes the legacy entry file once the replacement is active", async () => {
    const { auth, conversation, legacyGcsPath, legacyPath, manifestPath } =
      await setupLegacyFrameReplacement({ scope: "conversation" });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    assert(result.isOk(), "Replacement publish failed");
    expect(fileStorageMock.getObject(legacyGcsPath)).toBeUndefined();
  });

  it("leaves the legacy Frame untouched when the replacement fails to build", async () => {
    const {
      auth,
      conversation,
      legacyFrame,
      legacyGcsPath,
      legacyPath,
      manifestPath,
    } = await setupLegacyFrameReplacement({
      scope: "conversation",
      replacementUiSource: "export default function App() { return <p>",
    });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    expect(result.isErr()).toBe(true);
    const frame = await FileResource.fetchById(auth, legacyFrame.sId);
    assert(frame, "Frame not found");
    expect(frame.isInteractiveContent).toBe(true);
    expect(frame.toScopedPath(auth)).toBe(legacyPath);
    expect(fileStorageMock.getObject(legacyGcsPath)).toBe(uiSource);
  });

  it("moves the Pod pin and tab to the replacement", async () => {
    const { auth, conversation, legacyPath, manifestPath, pod } =
      await setupLegacyFrameReplacement({ scope: "pod" });
    assert(pod, "Pod not found");
    await ProjectMetadataResource.makeNew(auth, pod, {
      pinnedFramePath: legacyPath,
      frameTabs: [
        { path: legacyPath, title: "Sales", icon: "ActionDocumentIcon" },
      ],
      tabsOrder: ["conversations", legacyPath, "files", "tasks"],
    });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    assert(result.isOk(), "Replacement publish failed");
    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    assert(metadata, "Pod metadata not found");
    expect(metadata.pinnedFramePath).toBe(manifestPath);
    expect(metadata.frameTabs.map((tab) => tab.path)).toEqual([manifestPath]);
    expect(metadata.tabsOrder).toContain(manifestPath);
  });

  it("files declared domains on the Pod for a pod-mount replacement", async () => {
    const { auth, conversation, legacyPath, manifestPath, pod, workspace } =
      await setupLegacyFrameReplacement({
        scope: "pod",
        manifestContent: manifestWithDomains,
      });
    assert(pod, "Pod not created");

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    assert(result.isOk(), "Replacement publish failed");
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toMatchObject({
      kind: "filed",
      scope: "pod",
    });
    expect(
      requestedDomainsAt(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)
    ).toEqual(["api.stripe.com", "*.stripe.com"]);
  });

  it("files declared domains on the Pod for a conversation-mount replacement in a Pod conversation", async () => {
    const { auth, conversation, legacyPath, manifestPath, pod, workspace } =
      await setupLegacyFrameReplacement({
        scope: "pod-conversation",
        manifestContent: manifestWithDomains,
      });
    assert(pod, "Pod not created");

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    assert(result.isOk(), "Replacement publish failed");
    assert(result.value.kind === "v2");
    // The sandbox of a Pod conversation's Frame inherits the Pod's policy, so
    // the request must land there, not on the workspace.
    expect(result.value.egressDomains).toMatchObject({
      kind: "filed",
      scope: "pod",
    });
    expect(
      requestedDomainsAt(`w/${workspace.sId}/sandboxes/${pod.sId}.json`)
    ).toEqual(["api.stripe.com", "*.stripe.com"]);
    expect(
      fileStorageMock.getObject(`w/${workspace.sId}/sandbox-egress-policy.json`)
    ).toBeUndefined();
  });

  it("files declared domains on the workspace for a plain-conversation replacement", async () => {
    const { auth, conversation, legacyPath, manifestPath, workspace } =
      await setupLegacyFrameReplacement({
        scope: "conversation",
        manifestContent: manifestWithDomains,
      });

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: legacyPath,
    });

    assert(result.isOk(), "Replacement publish failed");
    assert(result.value.kind === "v2");
    expect(result.value.egressDomains).toMatchObject({
      kind: "filed",
      scope: "workspace",
    });
    expect(
      requestedDomainsAt(`w/${workspace.sId}/sandbox-egress-policy.json`)
    ).toEqual(["api.stripe.com", "*.stripe.com"]);
  });

  it("refuses to replace a file that is not a legacy Frame", async () => {
    const { auth, conversation, legacyFrame, manifestPath } =
      await setupLegacyFrameReplacement({ scope: "conversation" });
    const notAFramePath = manifestPath.replace(
      "Sales/manifest.json",
      "notes.md"
    );

    const result = await publishFrameFromSource(auth, {
      conversation,
      publishedByAgentConfigurationId: "test-agent",
      sourcePath: manifestPath,
      replacesPath: notAFramePath,
    });

    expect(result.isErr()).toBe(true);
    const frame = await FileResource.fetchById(auth, legacyFrame.sId);
    expect(frame?.isInteractiveContent).toBe(true);
  });
});

describe("publishFrameV2FromSource", () => {
  it("publishes artifacts without copying source and activates one publication", async () => {
    const {
      auth,
      conversation,
      frame,
      gcsSourceDirectoryPath,
      manifestPath,
      workspace,
    } = await setup();

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });

    assert(result.isOk());
    const identity = {
      workspaceId: workspace.sId,
      frameId: frame.sId,
      publicationId: result.value.publicationId,
    };
    const storedPublication = fileStorageMock.getObject(
      getFramePublicationDescriptorPath(identity)
    );
    assert(storedPublication);
    const publication = FramePublicationDescriptorSchema.parse(
      JSON.parse(storedPublication)
    );
    expect(publication.manifest).toEqual(
      FrameManifestSchema.parse(JSON.parse(manifest))
    );
    expect(
      fileStorageMock.saveFileCalls.some(({ filePath }) =>
        filePath.startsWith(`${gcsSourceDirectoryPath}/`)
      )
    ).toBe(false);

    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.useCaseMetadata?.activePublicationId).toBe(
      result.value.publicationId
    );
  });

  it.each<{
    declares: string;
    flags: WhitelistableFeature[];
    manifestContent: string;
    extraSources: Record<string, string>;
  }>([
    {
      declares: "functions",
      flags: [],
      manifestContent: functionManifest,
      extraSources: functionSources,
    },
    {
      declares: "databases",
      flags: ["frames_v2"],
      manifestContent: JSON.stringify({
        version: 1,
        description: "Store items.",
        databases: [{ name: "items", schema: "databases/items.db.ts" }],
      }),
      extraSources: { "databases/items.db.ts": "export {};" },
    },
    {
      declares: "functions",
      flags: ["frames_v2_functions"],
      manifestContent: functionManifest,
      extraSources: functionSources,
    },
  ])(
    "rejects a manifest declaring $declares with flags $flags",
    async ({ flags, manifestContent, extraSources }) => {
      const { auth, conversation, frame, manifestPath } = await setup({
        manifestContent,
        extraSources,
      });
      for (const flag of flags) {
        await FeatureFlagFactory.basic(auth, flag);
      }

      const result = await publishFrameV2FromSource(auth, {
        conversation,
        frame,
        manifestPath,
      });

      assert(result.isErr());
      expect(result.error).toMatchObject({ code: "invalid_manifest" });
      expect(result.error.message).toContain(
        "Frame functions and databases are not enabled"
      );
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      expect(reloaded?.useCaseMetadata?.activePublicationId).toBeUndefined();
    }
  );

  it("infers TSX source content type from its extension", async () => {
    const { auth, conversation, frame, manifestPath } = await setup({
      uiContentType: "application/x-tiled-tsx",
    });

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });

    expect(result.isOk()).toBe(true);
  });

  it("rejects a path that does not match the Frame identity", async () => {
    const { auth, conversation, frame } = await setup();

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath: `conversation-${conversation.sId}/Other/manifest.json`,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("revalidates the Frame source path after acquiring the source lock", async () => {
    const { auth, conversation, frame, manifestPath, workspace } =
      await setup();
    const staleFrame = await FileResource.fetchById(auth, frame.sId);
    assert(staleFrame);
    const movedManifestPath = `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Moved/${FRAME_MANIFEST_FILE}`;
    await frame.updateMount({
      destFileName: FRAME_MANIFEST_FILE,
      destMountFilePath: movedManifestPath,
      destUseCase: "conversation",
      destUseCaseMetadata: { conversationId: conversation.sId },
    });

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame: staleFrame,
      manifestPath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
    });
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("does not write when another source operation holds the lock", async () => {
    const { auth, conversation, frame, manifestPath } = await setup();
    const lockKey = `lock:${getFrameSourceLockName(frame.sId)}`;
    const redisClient = await getRedisStreamClient({ origin: "lock" });
    await redisClient.set(lockKey, "held-by-test", {
      NX: true,
      PX: 60_000,
    });
    vi.useFakeTimers();

    try {
      const publicationPromise = publishFrameV2FromSource(auth, {
        conversation,
        frame,
        manifestPath,
      });
      await vi.runAllTimersAsync();
      const published = await publicationPromise;

      expect(published.isErr() && published.error).toMatchObject({
        code: "publish_conflict",
        message:
          "Another source operation is in progress for this Frame; retry shortly.",
      });
      expect(fileStorageMock.saveFileCalls).toHaveLength(0);
      expect(fileStorageMock.writeStreamCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      await redisClient.del(lockKey);
    }
  });

  it("rejects publication from a read-only Pod", async () => {
    const {
      authenticator: auth,
      globalGroup,
      user,
      workspace,
    } = await createResourceTest({ role: "admin" });
    const space = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(space, globalGroup, "project_viewer");
    const viewerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    assert(viewerAuth);
    expect(viewerAuth.can("read", space)).toBe(true);
    expect(viewerAuth.can("write", space)).toBe(false);

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const sourceDirectoryPath = `pod-${space.sId}/Status`;
    const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
    const gcsSourceDirectoryPath = `${getPodFilesBasePath({
      workspaceId: workspace.sId,
      podId: space.sId,
    })}Status`;
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: Buffer.byteLength(manifest),
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
      mountFilePath: `${gcsSourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
    });
    const accessibleFrame = await FileResource.fetchById(viewerAuth, frame.sId);
    assert(accessibleFrame);

    const result = await publishFrameV2FromSource(viewerAuth, {
      conversation,
      frame: accessibleFrame,
      manifestPath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "unauthorized",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(0);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("bounds source listing before reading the folder", async () => {
    const { auth, conversation, frame, gcsSourceDirectoryPath, manifestPath } =
      await setup();
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix === `${gcsSourceDirectoryPath}/`
        ? Array.from({ length: 2_000 }, (_, index) => ({
            name: `${gcsSourceDirectoryPath}/file-${index}.txt`,
            metadata: { contentType: "text/plain", size: "1" },
          }))
        : null
    );

    const result = await publishFrameV2FromSource(auth, {
      conversation,
      frame,
      manifestPath,
    });

    expect(result.isErr() && result.error).toMatchObject({
      code: "invalid_source",
      message: "Frame source exceeds the publication file count limit.",
    });
    expect(fileStorageMock.readStreamCalls).toHaveLength(1);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });
});
