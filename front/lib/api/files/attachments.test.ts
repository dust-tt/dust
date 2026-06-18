import { getOrCreateConversationDataSourceFromFile } from "@app/lib/api/data_sources";
import { maybeUpsertFileAttachment } from "@app/lib/api/files/attachments";
import {
  CSV_UNSUPPORTED_ENCODING_ERROR_MESSAGE,
  processAndUpsertToDataSource,
} from "@app/lib/api/files/upsert";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/data_sources"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getOrCreateConversationDataSourceFromFile: vi.fn(),
  };
});

vi.mock(import("@app/lib/api/files/upsert"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    processAndUpsertToDataSource: vi.fn(),
  };
});

describe("maybeUpsertFileAttachment", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = {
      sId: "conv-test-sid",
      owner: workspace,
    } as unknown as ConversationType;

    vi.mocked(getOrCreateConversationDataSourceFromFile).mockResolvedValue(
      new Ok({} as any)
    );
    vi.mocked(processAndUpsertToDataSource).mockResolvedValue(
      new Ok({} as any)
    );
  });

  it("stamps conversationId on files without useCaseMetadata and attempts upsert", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/csv",
      fileName: "attachment.csv",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      conversationId: conversation.sId,
    });
    expect(processAndUpsertToDataSource).toHaveBeenCalledOnce();
  });

  it("merges conversationId while preserving a pre-existing skipDataSourceIndexing flag", async () => {
    // Webhook bodies and pasted text are stamped with skipDataSourceIndexing at creation; the
    // attach step must preserve that flag when adding conversationId, otherwise the indexing
    // short-circuit in processAndUpsertToDataSource would be bypassed.
    const file = await FileFactory.create(auth, null, {
      contentType: "application/json",
      fileName: "webhook_body_42_1000.json",
      fileSize: 50,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { skipDataSourceIndexing: true },
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      skipDataSourceIndexing: true,
      conversationId: conversation.sId,
    });
  });

  it("propagates upsert failures instead of swallowing them", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/csv",
      fileName: "report.csv",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    vi.mocked(processAndUpsertToDataSource).mockResolvedValue(
      new Err(
        new DustError(
          "invalid_csv_content",
          CSV_UNSUPPORTED_ENCODING_ERROR_MESSAGE
        )
      )
    );

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('"report.csv"');
      expect(result.error.message).toContain(
        CSV_UNSUPPORTED_ENCODING_ERROR_MESSAGE
      );
    }
  });

  it("does not block the attachment on internal upsert errors", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/csv",
      fileName: "report.csv",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
    });

    vi.mocked(processAndUpsertToDataSource).mockResolvedValue(
      new Err(new DustError("internal_error", "Failed to generate snippet."))
    );

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);
  });

  it("does not re-run when conversationId is already set", async () => {
    const file = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "attachment.txt",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "pre-existing-conv" },
    });

    const result = await maybeUpsertFileAttachment(auth, {
      contentFragments: [{ fileId: file.sId }],
      conversation,
    });

    expect(result.isOk()).toBe(true);
    expect(processAndUpsertToDataSource).not.toHaveBeenCalled();

    const reloaded = await FileResource.fetchById(auth, file.sId);
    expect(reloaded?.useCaseMetadata).toEqual({
      conversationId: "pre-existing-conv",
    });
  });
});
