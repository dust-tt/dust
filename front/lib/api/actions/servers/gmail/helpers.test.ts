import type { GmailMessagePayload } from "@app/lib/api/actions/servers/gmail/helpers";
import {
  findAttachmentData,
  findAttachmentIdByPartId,
} from "@app/lib/api/actions/servers/gmail/helpers";
import { describe, expect, it } from "vitest";

const payload: GmailMessagePayload = {
  partId: "",
  mimeType: "multipart/mixed",
  parts: [
    {
      partId: "0",
      mimeType: "multipart/alternative",
      parts: [
        {
          partId: "0.0",
          mimeType: "text/plain",
          body: { data: "aGVsbG8=", size: 5 },
        },
        {
          partId: "0.1",
          mimeType: "text/html",
          body: { data: "PGI+aGk8L2I+", size: 12 },
        },
      ],
    },
    {
      partId: "1",
      mimeType: "text/csv",
      filename: "export.csv",
      body: { attachmentId: "fresh-attachment-id", size: 17000 },
    },
  ],
};

describe("findAttachmentIdByPartId", () => {
  it("returns the attachment ID of the part matching partId", () => {
    expect(findAttachmentIdByPartId(payload, "1")).toBe("fresh-attachment-id");
  });

  it("returns null when the matching part has no attachment ID", () => {
    expect(findAttachmentIdByPartId(payload, "0.0")).toBeNull();
  });

  it("returns null when no part matches partId", () => {
    expect(findAttachmentIdByPartId(payload, "42")).toBeNull();
  });

  it("returns null when the payload is undefined", () => {
    expect(findAttachmentIdByPartId(undefined, "1")).toBeNull();
  });
});

describe("findAttachmentData", () => {
  it("returns the inline data of a nested part matching partId", () => {
    expect(findAttachmentData(payload, "0.1")).toBe("PGI+aGk8L2I+");
  });

  it("returns null when the matching part has no inline data", () => {
    expect(findAttachmentData(payload, "1")).toBeNull();
  });

  it("returns null when no part matches partId", () => {
    expect(findAttachmentData(payload, "42")).toBeNull();
  });
});
