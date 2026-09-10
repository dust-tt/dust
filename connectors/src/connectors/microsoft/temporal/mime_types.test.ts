import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { resolveMicrosoftMimeType } from "@connectors/connectors/microsoft/temporal/mime_types";
import { describe, expect, it } from "vitest";

function makeItem(name: string | undefined, mimeType?: string): DriveItem {
  return {
    name,
    file: mimeType === undefined ? {} : { mimeType },
    "@microsoft.graph.downloadUrl": "",
  };
}

describe("resolveMicrosoftMimeType", () => {
  it("returns the raw mime type when it is a real (non-octet-stream) type", () => {
    expect(resolveMicrosoftMimeType(makeItem("notes.txt", "text/plain"))).toBe(
      "text/plain"
    );
    expect(
      resolveMicrosoftMimeType(makeItem("data.bin", "application/pdf"))
    ).toBe("application/pdf");
  });

  it("maps known text extensions when Graph reports application/octet-stream", () => {
    expect(
      resolveMicrosoftMimeType(
        makeItem("ACH75VI2.txt", "application/octet-stream")
      )
    ).toBe("text/plain");
    expect(
      resolveMicrosoftMimeType(
        makeItem("README.md", "application/octet-stream")
      )
    ).toBe("text/markdown");
    expect(
      resolveMicrosoftMimeType(
        makeItem("doc.markdown", "application/octet-stream")
      )
    ).toBe("text/markdown");
  });

  it("is case-insensitive on the extension", () => {
    expect(
      resolveMicrosoftMimeType(
        makeItem("LEGACY.TXT", "application/octet-stream")
      )
    ).toBe("text/plain");
  });

  it("does not apply the extension fallback when the mime type is absent", () => {
    expect(
      resolveMicrosoftMimeType(makeItem("notes.txt", undefined))
    ).toBeUndefined();
  });

  it("leaves octet-stream unchanged for unknown extensions", () => {
    expect(
      resolveMicrosoftMimeType(
        makeItem("archive.zip", "application/octet-stream")
      )
    ).toBe("application/octet-stream");
    expect(
      resolveMicrosoftMimeType(makeItem("noext", "application/octet-stream"))
    ).toBe("application/octet-stream");
  });

  it("returns undefined when the mime type is absent and no extension matches", () => {
    expect(
      resolveMicrosoftMimeType(makeItem("archive.zip", undefined))
    ).toBeUndefined();
    expect(
      resolveMicrosoftMimeType(makeItem(undefined, undefined))
    ).toBeUndefined();
  });
});
