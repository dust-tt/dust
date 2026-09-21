import { partitionArchiveFiles } from "@app/components/pod/files/podArchiveUpload";
import { describe, expect, it } from "vitest";

function makeFile(name: string, type = ""): File {
  return new File(["content"], name, { type });
}

describe("partitionArchiveFiles", () => {
  it("separates archives from regular files", () => {
    const report = makeFile("report.pdf", "application/pdf");
    const bundle = makeFile("bundle.zip", "application/zip");

    const { archives, regularFiles } = partitionArchiveFiles([report, bundle]);

    expect(archives).toEqual([bundle]);
    expect(regularFiles).toEqual([report]);
  });

  it("matches the extension whatever its case", () => {
    const bundle = makeFile("BUNDLE.ZIP");

    const { archives, regularFiles } = partitionArchiveFiles([bundle]);

    expect(archives).toEqual([bundle]);
    expect(regularFiles).toEqual([]);
  });

  it("matches a zip content type when the name has no extension", () => {
    const bundle = makeFile("bundle", "application/x-zip-compressed");

    const { archives } = partitionArchiveFiles([bundle]);

    expect(archives).toEqual([bundle]);
  });

  it("keeps a file whose name merely contains zip as a regular file", () => {
    const notes = makeFile("zipline-notes.md", "text/markdown");

    const { archives, regularFiles } = partitionArchiveFiles([notes]);

    expect(archives).toEqual([]);
    expect(regularFiles).toEqual([notes]);
  });
});
