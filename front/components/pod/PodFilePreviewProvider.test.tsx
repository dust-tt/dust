import { useFilePreviewContext } from "@app/components/assistant/conversation/FilePreviewContext";
import { PodFilePreviewProvider } from "@app/components/pod/PodFilePreviewProvider";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { PodType } from "@app/types/space";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/components/file_explorer/FilePreviewDialog", () => ({
  FilePreviewDialog: ({
    entry,
    onOpenChange,
  }: {
    entry: { fileName: string } | null;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label={entry?.fileName ?? "loading"}>
      <button type="button" onClick={() => onOpenChange(false)}>
        close
      </button>
    </div>
  ),
}));

vi.mock("@app/components/file_explorer/useFileEntryFromPath", () => ({
  useFileEntryFromPath: ({ filePath }: { filePath: string }) => ({
    entry: { fileName: filePath.split("/").pop() },
    isLoading: false,
    isNotFound: false,
  }),
}));

vi.mock("@app/components/pod/files/PodFrameSheet", () => ({
  PodFrameSheet: ({
    isOpen,
    fileId,
  }: {
    isOpen: boolean;
    fileId: string | null;
  }) => (isOpen ? <div role="region" aria-label={`frame ${fileId}`} /> : null),
}));

const owner = LightWorkspaceFactory.build();

const POD: PodType = {
  createdAt: 0,
  updatedAt: 0,
  kind: "project",
  name: "Pod",
  sId: "vlt_pod",
  groupIds: [],
  isRestricted: false,
  description: null,
  isMember: true,
  isEditor: true,
  archivedAt: null,
};

interface OpenButtonProps {
  filePath: string;
  contentType: string;
}

function OpenButton({ filePath, contentType }: OpenButtonProps) {
  const { canPreview, openFilePreview } = useFilePreviewContext();
  return (
    <button
      type="button"
      disabled={!canPreview}
      onClick={() => openFilePreview({ filePath, contentType })}
    >
      open
    </button>
  );
}

function OpenFrameButton() {
  const { openFramePreview } = useFilePreviewContext();
  return (
    <button
      type="button"
      onClick={() => void openFramePreview({ fileId: "fil_frame" })}
    >
      open frame
    </button>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PodFilePreviewProvider", () => {
  it("opens a previewable file in a dialog stacked on the page, and closing removes it", () => {
    render(
      <PodFilePreviewProvider owner={owner} pod={POD}>
        <OpenButton
          filePath="pod-vlt_pod/reports/q3.pdf"
          contentType="application/pdf"
        />
      </PodFilePreviewProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog", { name: "q3.pdf" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("downloads a file it cannot preview", () => {
    const windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <PodFilePreviewProvider owner={owner} pod={POD}>
        <OpenButton
          filePath="pod-vlt_pod/archive.bin"
          contentType="application/octet-stream"
        />
      </PodFilePreviewProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "open" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(windowOpen).toHaveBeenCalledWith(
      expect.stringContaining("archive.bin"),
      "_blank"
    );
  });

  it("opens a Frame in the pod's Frame sheet", async () => {
    render(
      <PodFilePreviewProvider owner={owner} pod={POD}>
        <OpenFrameButton />
      </PodFilePreviewProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "open frame" }));
    });

    expect(
      screen.getByRole("region", { name: "frame fil_frame" })
    ).toBeDefined();
  });
});
