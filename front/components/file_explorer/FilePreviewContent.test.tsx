import type { FileEntry } from "@app/components/file_explorer/types";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilePreviewContent } from "./FilePreviewContent";

function renderDelimited(
  content: string,
  { fileName, contentType }: { fileName: string; contentType: string }
) {
  const entry: FileEntry = {
    kind: "file",
    isDirectory: false,
    fileName,
    path: `conversation-c1/${fileName}`,
    contentType,
    fileId: null,
    thumbnailUrl: null,
    sizeBytes: content.length,
    lastModifiedMs: 0,
  };

  return render(
    <FilePreviewContent
      category="delimited"
      entry={entry}
      fileContent={content}
      fileUrl={`/files/${fileName}`}
      isContentLoading={false}
      processedContent={null}
    />
  );
}

function renderCsv(content: string) {
  return renderDelimited(content, {
    fileName: "data.csv",
    contentType: "text/csv",
  });
}

// The scrollable table only draws the rows that fit in its measured container.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
  for (const observer of ["ResizeObserver", "IntersectionObserver"]) {
    vi.stubGlobal(
      observer,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FilePreviewContent delimited preview", () => {
  it("renders a CSV whose header has empty cells", () => {
    renderCsv("Name,Age,,\nAlice,30,,\nBob,25,,");

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("keeps each value in its own column when headers repeat", () => {
    renderCsv("Total,Total\nfirst,second");

    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("keeps a quoted delimiter inside its cell", () => {
    renderCsv('Total,Total\n"first,part",second');

    expect(screen.getByText("first,part")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("keeps a TSV header row made only of empty cells", () => {
    renderDelimited("\t\nfirst\tsecond", {
      fileName: "data.tsv",
      contentType: "text/tsv",
    });

    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });

  it("drops a last record cut inside a quoted cell", () => {
    renderCsv('Name,Age\nAlice,30\n"Bo');

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
