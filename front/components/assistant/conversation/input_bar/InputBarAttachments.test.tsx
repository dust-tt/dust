import { InputBarAttachments } from "@app/components/assistant/conversation/input_bar/InputBarAttachments";
import type {
  FileBlob,
  FileUploaderService,
} from "@app/hooks/useFileUploaderService";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { mockOpenFilePreview } = vi.hoisted(() => ({
  mockOpenFilePreview: vi.fn(),
}));

vi.mock(
  import("@app/components/assistant/conversation/FilePreviewContext"),
  () => ({
    useFilePreviewContext: () => ({
      openFilePreview: mockOpenFilePreview,
      resolveFileIdFromPath: async () => null,
    }),
  })
);

vi.mock(import("@app/components/sparkle/ThemeContext"), () => ({
  useTheme: () => ({ isDark: false, theme: "light", setTheme: vi.fn() }),
}));

vi.mock(import("@app/hooks/useNotification"), () => ({
  useSendNotification: () => vi.fn(),
}));

vi.mock(import("@app/lib/swr/spaces"), () => ({
  useSpaces: () => ({
    spaces: [
      {
        sId: "space_1",
        name: "Engineering",
        kind: "regular",
        managementMode: "manual",
        createdAt: 0,
        updatedAt: 0,
        groupIds: [],
        isRestricted: false,
      },
    ],
    isSpacesLoading: false,
    isSpacesError: null,
    mutate: vi.fn(async () => undefined),
  }),
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

function makeFileBlob(overrides: Partial<FileBlob> = {}): FileBlob {
  const filename = overrides.filename ?? "report.pdf";
  const contentType = overrides.contentType ?? "application/pdf";
  return {
    contentType,
    file: new File(["content"], filename, { type: contentType }),
    filename,
    id: filename,
    fileId: `fil_${filename}`,
    isUploading: false,
    size: 1024,
    ...overrides,
  };
}

function makeService(fileBlobs: FileBlob[]): FileUploaderService {
  return {
    addUploadedFile: vi.fn(),
    fileBlobs,
    getFileBlob: vi.fn(),
    getFileBlobs: vi.fn(),
    handleFileChange: vi.fn(),
    handleFilesUpload: vi.fn(),
    isProcessingFiles: fileBlobs.some((blob) => blob.isUploading),
    removeFile: vi.fn(),
    resetUpload: vi.fn(),
  };
}

function makeNode(
  overrides: Partial<DataSourceViewContentNode> = {}
): DataSourceViewContentNode {
  return {
    childrenCount: 0,
    expandable: false,
    internalId: "notion-page-1",
    lastUpdatedAt: null,
    mimeType: "application/vnd.dust.notion.page",
    parentInternalId: null,
    parentInternalIds: null,
    parentTitle: "Roadmaps",
    permission: "read",
    providerVisibility: null,
    sourceUrl: "https://notion.so/page-1",
    title: "Product Roadmap",
    type: "document",
    dataSourceView: {
      category: "managed",
      createdAt: 0,
      id: 1,
      kind: "default",
      parentsIn: null,
      sId: "dsv_1",
      spaceId: "space_1",
      updatedAt: 0,
      dataSource: {
        id: 1,
        sId: "ds_1",
        createdAt: 0,
        name: "Notion",
        description: null,
        assistantDefaultSelected: false,
        dustAPIProjectId: "p",
        dustAPIDataSourceId: "d",
        connectorId: "c_1",
        connectorProvider: "notion",
      },
    },
    ...overrides,
  };
}

function renderAttachments({
  fileBlobs = [],
  nodes = [],
  onRemoveNode = vi.fn(),
  disable,
}: {
  fileBlobs?: FileBlob[];
  nodes?: DataSourceViewContentNode[];
  onRemoveNode?: (node: DataSourceViewContentNode) => void;
  disable?: boolean;
} = {}) {
  const service = makeService(fileBlobs);
  const result = render(
    <InputBarAttachments
      owner={owner}
      files={{ service }}
      nodes={{ items: nodes, onRemove: onRemoveNode }}
      disable={disable}
    />
  );
  return { ...result, service, onRemoveNode };
}

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("InputBarAttachments", () => {
  it("renders nothing without attachments", () => {
    const { container } = renderAttachments();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a file attachment as a clickable chip with a remove button", () => {
    const { container } = renderAttachments({
      fileBlobs: [makeFileBlob()],
    });

    // The chip is a single button labelled with the file name.
    const chip = screen.getByRole("button", { name: "report.pdf" });
    expect(chip).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a knowledge attachment as a chip linking to its source", () => {
    const { container } = renderAttachments({ nodes: [makeNode()] });

    const link = screen.getByRole("link", { name: /Product Roadmap/ });
    expect(link).toHaveAttribute("href", "https://notion.so/page-1");
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an image attachment with a thumbnail preview instead of a chip", () => {
    const { container } = renderAttachments({
      fileBlobs: [
        makeFileBlob({
          filename: "photo.png",
          contentType: "image/png",
          sourceUrl: "https://example.com/photo.png",
        }),
      ],
    });

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/photo.png"
    );
    // Chips carry the title as their aria-label; the preview must not be one.
    expect(container.querySelector('[aria-label="photo.png"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("reserves the preview slot while an image is still uploading", () => {
    const { container } = renderAttachments({
      fileBlobs: [
        makeFileBlob({
          filename: "photo.png",
          contentType: "image/png",
          fileId: null,
          isUploading: true,
        }),
      ],
    });

    // A loading preview rather than a chip: spinner, no thumbnail, no chip label.
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-label="photo.png"]')).toBeNull();
  });

  it("falls back to a chip for an image without a preview", () => {
    renderAttachments({
      fileBlobs: [
        makeFileBlob({ filename: "photo.png", contentType: "image/png" }),
      ],
    });

    expect(
      screen.getByRole("button", { name: "photo.png" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("falls back to a chip for an uploaded image without a file id", () => {
    const { container } = renderAttachments({
      fileBlobs: [
        makeFileBlob({
          filename: "photo.png",
          contentType: "image/png",
          fileId: null,
          sourceUrl: "https://example.com/photo.png",
        }),
      ],
    });

    expect(container.querySelector('[aria-label="photo.png"]')).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an uploading file as a non-interactive chip", () => {
    const { container } = renderAttachments({
      fileBlobs: [
        makeFileBlob({
          filename: "notes.txt",
          contentType: "text/plain",
          fileId: null,
          isUploading: true,
        }),
      ],
    });

    // No file id yet, so the chip is labelled but not clickable.
    expect(container.querySelector('[aria-label="notes.txt"]')).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "notes.txt" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("renders multiple attachments, images first then chips", () => {
    const { container } = renderAttachments({
      fileBlobs: [
        makeFileBlob({ filename: "a.pdf" }),
        makeFileBlob({
          filename: "photo.png",
          contentType: "image/png",
          sourceUrl: "https://example.com/photo.png",
        }),
        makeFileBlob({ filename: "b.csv", contentType: "text/csv" }),
      ],
      nodes: [makeNode()],
    });

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "a.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "b.csv" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Product Roadmap/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(4);

    // Images come before chips in document order.
    const image = container.querySelector("img");
    const firstChip = screen.getByRole("button", { name: "a.pdf" });
    expect(image?.compareDocumentPosition(firstChip)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("removes a file attachment from the remove button", async () => {
    const user = userEvent.setup();
    const { service } = renderAttachments({
      fileBlobs: [makeFileBlob()],
    });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(service.removeFile).toHaveBeenCalledWith("report.pdf");
    expect(mockOpenFilePreview).not.toHaveBeenCalled();
  });

  it("removes a knowledge attachment from the remove button", async () => {
    const user = userEvent.setup();
    const node = makeNode();
    const { onRemoveNode } = renderAttachments({ nodes: [node] });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemoveNode).toHaveBeenCalledWith(node);
  });

  it("hides the remove buttons when disabled", () => {
    renderAttachments({
      fileBlobs: [makeFileBlob()],
      nodes: [makeNode()],
      disable: true,
    });

    expect(
      screen.queryByRole("button", { name: "Remove" })
    ).not.toBeInTheDocument();
  });

  it("opens the file preview from the keyboard", async () => {
    const user = userEvent.setup();
    renderAttachments({ fileBlobs: [makeFileBlob()] });

    await user.tab();
    expect(screen.getByRole("button", { name: "report.pdf" })).toHaveFocus();

    await user.keyboard("{Enter}");

    expect(mockOpenFilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "fil_report.pdf",
        title: "report.pdf",
        contentType: "application/pdf",
      })
    );
  });
});
