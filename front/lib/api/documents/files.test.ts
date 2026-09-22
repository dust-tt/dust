// @vitest-environment node

import assert from "node:assert";
import { importDocumentMarkdown } from "@app/lib/api/documents/content";
import {
  loadDocumentByPath,
  saveDocumentByPath,
} from "@app/lib/api/documents/files";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { Authenticator } from "@app/lib/auth";
import { streamToBuffer } from "@app/lib/utils/streams";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { DOCUMENT_MAX_BYTES, documentContentType } from "@app/types/documents";
import { beforeEach, describe, expect, it } from "vitest";

const createFile = async () => {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const path = `conversation-${conversation.sId}/brief.dustdoc`;
  const fs = await DustFileSystem.fromScopedPath(auth, path);
  assert(fs.isOk());
  const mountPath = fs.value.toMountFilePath(path);
  assert(mountPath);
  const document = importDocumentMarkdown("# Brief\n\nUser notes.");
  assert(document);
  fileStorageMock.setObject(mountPath, JSON.stringify(document));
  return { auth, path, mountPath, document, conversation };
};

describe("documents through existing Files paths", () => {
  beforeEach(() => fileStorageMock.enableVersioning());

  it("opens an ordinary file without registration, saves and reopens it", async () => {
    const { auth, path, mountPath } = await createFile();
    const loaded = await loadDocumentByPath(auth, path);
    assert(loaded.isOk());
    expect(loaded.value.canEdit).toBe(true);
    expect(loaded.value.canonicalPath).toBe(path);
    const document = importDocumentMarkdown(
      "# Reviewed\n\nUser notes preserved."
    );
    assert(document);
    const saved = await saveDocumentByPath(auth, path, {
      source: JSON.stringify(document),
      revision: loaded.value.revision,
    });
    assert(saved.isOk());
    const reopened = await loadDocumentByPath(auth, path);
    assert(reopened.isOk());
    expect(reopened.value.document).toEqual(document);
    expect(reopened.value.revision).toBe(saved.value.revision);
    expect(fileStorageMock.getObject(mountPath)).toBe(JSON.stringify(document));
  });

  it("reads registered documents from their edited mount instead of the original upload", async () => {
    const { auth, path, mountPath, document, conversation } =
      await createFile();
    const originalSource = JSON.stringify(document);
    const file = await FileFactory.create(auth, null, {
      contentType: documentContentType,
      fileName: "brief.dustdoc",
      fileSize: Buffer.byteLength(originalSource),
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: mountPath,
    });
    fileStorageMock.setObject(
      file.getCloudStoragePath(auth, "original"),
      originalSource
    );
    const loaded = await loadDocumentByPath(auth, path);
    assert(loaded.isOk());
    const editedDocument = importDocumentMarkdown("# Edited mounted document");
    assert(editedDocument);
    const editedSource = JSON.stringify(editedDocument);
    const saved = await saveDocumentByPath(auth, path, {
      source: editedSource,
      revision: loaded.value.revision,
    });
    assert(saved.isOk());

    const originalRead = await streamToBuffer(
      file.getReadStream({ auth, version: "original" })
    );
    const sharedRead = await streamToBuffer(
      file.getSharedReadStream(auth.getNonNullableWorkspace(), "original")
    );
    assert(originalRead.isOk());
    assert(sharedRead.isOk());
    expect(originalRead.value.toString()).toBe(editedSource);
    expect(sharedRead.value.toString()).toBe(editedSource);
    await file.getSignedUrlForDownload(auth, "original");
    expect(fileStorageMock.signedUrlCalls.at(-1)?.filePath).toBe(mountPath);
  });

  it("saves named visuals and reports unsupported blocks without overwriting", async () => {
    const { auth, path, mountPath, document } = await createFile();
    const loaded = await loadDocumentByPath(auth, path);
    assert(loaded.isOk());
    const edited = {
      ...document,
      content: {
        type: "doc",
        content: [{ type: "dustVisual", attrs: { name: "revenue" } }],
      },
    };
    const source = JSON.stringify(edited);
    const saved = await saveDocumentByPath(auth, path, {
      source,
      revision: loaded.value.revision,
    });
    assert(saved.isOk());
    const reopened = await loadDocumentByPath(auth, path);
    assert(reopened.isOk());
    expect(reopened.value.document).toEqual(edited);

    const rejected = await saveDocumentByPath(auth, path, {
      source: JSON.stringify({
        ...edited,
        content: { type: "doc", content: [{ type: "customChart" }] },
      }),
      revision: saved.value.revision,
    });
    assert(rejected.isErr());
    expect(rejected.error.message).toContain("Unsupported block: customChart.");
    expect(fileStorageMock.getObject(mountPath)).toBe(source);
  });

  it("accepts only one save for a loaded revision and preserves the winner", async () => {
    const { auth, path } = await createFile();
    const loaded = await loadDocumentByPath(auth, path);
    assert(loaded.isOk());
    const first = importDocumentMarkdown("# First edit");
    const second = importDocumentMarkdown("# Second edit");
    assert(first && second);
    const results = await Promise.all([
      saveDocumentByPath(auth, path, {
        source: JSON.stringify(first),
        revision: loaded.value.revision,
      }),
      saveDocumentByPath(auth, path, {
        source: JSON.stringify(second),
        revision: loaded.value.revision,
      }),
    ]);
    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    const rejected = results.find((result) => result.isErr());
    assert(rejected?.isErr());
    expect(rejected.error.code).toBe("conflict");
    const reopened = await loadDocumentByPath(auth, path);
    assert(reopened.isOk());
    expect(reopened.value.document).toEqual(results[0].isOk() ? first : second);
  });

  it("preserves an external edit and a replacement at the same path", async () => {
    const { auth, path, mountPath } = await createFile();
    const loaded = await loadDocumentByPath(auth, path);
    assert(loaded.isOk());
    const source = JSON.stringify(importDocumentMarkdown("# Agent update"));
    fileStorageMock.setObject(mountPath, source);
    const result = await saveDocumentByPath(auth, path, {
      source: JSON.stringify(loaded.value.document),
      revision: loaded.value.revision,
    });
    assert(result.isErr());
    expect(result.error.code).toBe("conflict");
    expect(fileStorageMock.getObject(mountPath)).toBe(source);
  });

  it("pins returned bytes to the revision despite a concurrent file edit", async () => {
    const { auth, path, mountPath, document } = await createFile();
    const loaded = await loadDocumentByPath(auth, path);
    assert(loaded.isOk());
    fileStorageMock.setFileMetadata((storagePath) => {
      if (storagePath !== mountPath) {
        return null;
      }
      fileStorageMock.setObject(
        mountPath,
        JSON.stringify(importDocumentMarkdown("# Newer"))
      );
      return {
        contentType: "application/octet-stream",
        size: "10",
        generation: loaded.value.revision,
      };
    });
    const snapshot = await loadDocumentByPath(auth, path);
    assert(snapshot.isOk());
    expect(snapshot.value.document).toEqual(document);
    expect(snapshot.value.revision).toBe(loaded.value.revision);
  });

  it("rejects invalid and oversized files without changing their bytes", async () => {
    const { auth, path, mountPath } = await createFile();
    for (const source of ["{unfinished", "x".repeat(DOCUMENT_MAX_BYTES + 1)]) {
      fileStorageMock.setObject(mountPath, source);
      const loaded = await loadDocumentByPath(auth, path);
      assert(loaded.isErr());
      expect(loaded.error.code).toBe("invalid_document");
      expect(fileStorageMock.getObject(mountPath)).toBe(source);
    }
  });

  it("does not resolve another workspace's document", async () => {
    const { path } = await createFile();
    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });
    const loaded = await loadDocumentByPath(otherAuth, path);
    const saved = await saveDocumentByPath(otherAuth, path, {
      source: "{}",
      revision: "1",
    });
    expect(loaded.isErr()).toBe(true);
    expect(saved.isErr()).toBe(true);
  });

  it("denies a same-workspace outsider read and write access to a private Pod document", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspace = auth.getNonNullableWorkspace();
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id
    );
    const podAuth = await Authenticator.fromUserIdAndWorkspaceId(
      auth.getNonNullableUser().sId,
      workspace.sId
    );
    const path = `pod-${pod.sId}/private.dustdoc`;
    const fs = await DustFileSystem.fromScopedPath(podAuth, path);
    assert(fs.isOk());
    const mountPath = fs.value.toMountFilePath(path);
    assert(mountPath);
    const document = importDocumentMarkdown("# Private");
    assert(document);
    const source = JSON.stringify(document);
    fileStorageMock.setObject(mountPath, source);
    const loaded = await loadDocumentByPath(podAuth, path);
    assert(loaded.isOk());

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );
    const outsiderRead = await loadDocumentByPath(outsiderAuth, path);
    const outsiderWrite = await saveDocumentByPath(outsiderAuth, path, {
      source,
      revision: loaded.value.revision,
    });
    assert(outsiderRead.isErr());
    assert(outsiderWrite.isErr());
    expect(outsiderRead.error.code).toBe("not_found");
    expect(outsiderWrite.error.code).toBe("not_found");
    expect(fileStorageMock.getObject(mountPath)).toBe(source);
  });
});
