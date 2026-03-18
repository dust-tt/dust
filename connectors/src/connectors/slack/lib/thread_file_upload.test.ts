import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import { describe, expect, it } from "vitest";

import {
  countPendingSlackFileMetadata,
  getSlackFilesFromMessages,
  hasPendingSlackFileMetadata,
  type SlackThreadFile,
  selectBotThreadMessages,
} from "./thread_file_upload";

describe("selectBotThreadMessages", () => {
  it("keeps thread messages from the starting ts and allows the configured bot", () => {
    const replies = [
      { ts: "1", user: "U1", text: "before" },
      { ts: "2", bot_id: "B2", text: "ignored bot" },
      { ts: "3", user: "U3", text: "start" },
      { ts: "4", bot_id: "B-allowed", text: "allowed bot" },
      { ts: "5", user: "U5", text: "after" },
    ] as MessageElement[];

    expect(
      selectBotThreadMessages({
        replies,
        startingAtTs: "3",
        allowedSlackBotId: "B-allowed",
      }).map((reply) => reply.ts)
    ).toEqual(["3", "4", "5"]);
  });
});

describe("getSlackFilesFromMessages", () => {
  it("returns files from all messages and removes null entries", () => {
    const messages = [
      {
        ts: "1",
        user: "U1",
        files: [{ id: "F1" }, null, { id: "F2" }],
      },
      {
        ts: "2",
        user: "U2",
      },
    ] as MessageElement[];

    expect(getSlackFilesFromMessages(messages).map((file) => file.id)).toEqual([
      "F1",
      "F2",
    ]);
  });
});

describe("hasPendingSlackFileMetadata", () => {
  it("returns true when slack file metadata is not fully ready", () => {
    expect(
      hasPendingSlackFileMetadata([
        {
          id: "F1",
          mimetype: "application/pdf",
          size: 42,
          url_private_download: "https://example.com",
        },
        {
          id: "F2",
          mimetype: "application/pdf",
          size: 42,
        },
      ] as SlackThreadFile[])
    ).toBe(true);
  });

  it("returns false when all slack file metadata is ready", () => {
    expect(
      hasPendingSlackFileMetadata([
        {
          id: "F1",
          mimetype: "application/pdf",
          size: 42,
          url_private_download: "https://example.com",
        },
      ] as SlackThreadFile[])
    ).toBe(false);
  });
});

describe("countPendingSlackFileMetadata", () => {
  it("counts each missing field independently", () => {
    expect(
      countPendingSlackFileMetadata([
        {
          id: "F1",
          mimetype: "application/pdf",
          size: 42,
        },
        {
          id: "F2",
          url_private_download: "https://example.com",
        },
      ] as SlackThreadFile[])
    ).toEqual({
      missingMimetypeCount: 1,
      missingPrivateDownloadUrlCount: 1,
      missingSizeCount: 1,
    });
  });
});
