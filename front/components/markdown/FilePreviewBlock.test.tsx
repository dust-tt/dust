import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { makeFileAttachment } from "@app/lib/api/assistant/conversation/attachments";
import {
  getFilePreviewDirectivePaths,
  getFilePreviewMarkdownDirective,
} from "@app/lib/markdown/file_preview";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { ConversationAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { DUST_FILE_ID_HEADER, frameContentType } from "@app/types/files";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FilePreviewLookupContextValue } from "./FilePreviewBlock";
import {
  FilePreviewLookupContext,
  filePreviewDirective,
  getFilePreviewPlugin,
} from "./FilePreviewBlock";

let attachmentsMock: ConversationAttachmentType[] = [];

vi.mock("@app/hooks/conversations/useConversationAttachments", () => ({
  useConversationAttachments: () => ({
    attachments: attachmentsMock,
    isConversationAttachmentsLoading: false,
    isConversationAttachmentsError: undefined,
    mutateConversationAttachments: vi.fn(),
  }),
}));

const mockOwner = LightWorkspaceFactory.build({
  sId: "w_test_ws",
});

const mockClientFetch = vi.fn();
vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

type DirectiveNode = {
  attributes?: Record<string, string>;
  children?: Array<{ type: string; value: string }>;
  data?: {
    hName?: string;
    hProperties?: Record<string, string | undefined>;
  };
  name: string;
  type: "leafDirective" | "textDirective";
};

type DirectiveTree = {
  children: DirectiveNode[];
  type: "root";
};

describe("filePreviewDirective", () => {
  it("transforms :preview_file textDirective nodes with path and content type", () => {
    const tree: DirectiveTree = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "preview_file",
          attributes: {
            path: "conversation-c1/report.pdf",
            contentType: "application/pdf",
          },
          children: [{ type: "text", value: "report.pdf" }],
        },
      ],
    };

    filePreviewDirective()(tree);

    expect(tree.children[0].data?.hName).toBe("file_preview");
    expect(tree.children[0].data?.hProperties).toEqual({
      path: "conversation-c1/report.pdf",
      title: "report.pdf",
      contentType: "application/pdf",
    });
  });

  it("supports title and content_type attributes", () => {
    const tree: DirectiveTree = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "preview_file",
          attributes: {
            path: "pod-p1/export.csv",
            title: "export.csv",
            content_type: "text/csv",
          },
        },
      ],
    };

    filePreviewDirective()(tree);

    expect(tree.children[0].data?.hProperties).toEqual({
      path: "pod-p1/export.csv",
      title: "export.csv",
      contentType: "text/csv",
    });
  });

  it("does not transform directives without a path", () => {
    const tree: DirectiveTree = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "preview_file",
          attributes: {},
          children: [{ type: "text", value: "report.pdf" }],
        },
      ],
    };

    filePreviewDirective()(tree);

    expect(tree.children[0].data).toBeUndefined();
  });
});

describe("getFilePreviewDirectivePaths", () => {
  it("extracts paths from generated text directives", () => {
    const directive = getFilePreviewMarkdownDirective({
      path: 'conversation-c1/reports/report "Q2".pdf',
      title: 'report "Q2".pdf',
      contentType: "application/pdf",
    });

    expect([...getFilePreviewDirectivePaths(`Preview\n${directive}`)]).toEqual([
      'conversation-c1/reports/report "Q2".pdf',
    ]);
  });
});

describe("getFilePreviewPlugin", () => {
  it("renders a previewable file with the file name", async () => {
    const FilePreview = getFilePreviewPlugin();

    const { container } = render(
      <FilePreviewProvider owner={mockOwner}>
        <FilePreview
          path="conversation-c1/reports/report final.pdf"
          title="report final.pdf"
          contentType="application/pdf"
        />
      </FilePreviewProvider>
    );

    expect(screen.getByText("report final.pdf")).toBeInTheDocument();
    expect(container.querySelector("a[href*='download=1']")).toBeNull();
    expect(container.querySelector("button button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "report final.pdf" }));

    expect(
      await screen.findByRole("dialog", { name: "report final.pdf" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" })
    ).toBeInTheDocument();
  });

  it("opens Frame files in the interactive content side panel", async () => {
    const FilePreview = getFilePreviewPlugin();
    const openPanel = vi.fn();
    mockClientFetch.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { [DUST_FILE_ID_HEADER]: "fil_frame" },
      })
    );

    render(
      <ConversationSidePanelContext.Provider
        value={{
          currentPanel: undefined,
          openPanel,
          togglePanel: vi.fn(),
          closePanel: vi.fn(),
          onPanelClosed: vi.fn(),
          setPanelRef: vi.fn(),
          panelRef: { current: null },
          setVirtuosoMsg: vi.fn(),
          virtuosoMsg: null,
          data: undefined,
        }}
      >
        <FilePreviewProvider owner={mockOwner}>
          <FilePreview
            path="conversation-c1/frame.tsx"
            title="frame.tsx"
            contentType={frameContentType}
          />
        </FilePreviewProvider>
      </ConversationSidePanelContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "frame.tsx" }));

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: "fil_frame",
      });
    });
    expect(mockClientFetch).toHaveBeenCalledWith(
      "/api/w/w_test_ws/files/path/conversation-c1/frame.tsx?metadata=1",
      { method: "HEAD" }
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("infers the file name from the scoped path when metadata is absent", () => {
    const FilePreview = getFilePreviewPlugin();

    render(<FilePreview path="conversation-c1/exports/data.csv" />);

    expect(screen.getByText("data.csv")).toBeInTheDocument();
  });
});

describe("FilePreviewBlock interactive file resolution", () => {
  const openPanel = vi.fn();

  beforeEach(() => {
    openPanel.mockClear();
    attachmentsMock = [];
  });

  function renderWithLookup({
    children,
    generatedFiles,
  }: {
    children: ReactNode;
    generatedFiles: FilePreviewLookupContextValue["generatedFiles"];
  }) {
    return render(
      <FilePreviewProvider owner={mockOwner}>
        <ConversationSidePanelContext.Provider
          value={{
            closePanel: vi.fn(),
            currentPanel: undefined,
            data: undefined,
            onPanelClosed: vi.fn(),
            openPanel,
            panelRef: { current: null },
            setPanelRef: vi.fn(),
            setVirtuosoMsg: vi.fn(),
            togglePanel: vi.fn(),
            virtuosoMsg: null,
          }}
        >
          <FilePreviewLookupContext.Provider
            value={{
              conversationId: "c1",
              generatedFiles,
              owner: mockOwner,
            }}
          >
            {children}
          </FilePreviewLookupContext.Provider>
        </ConversationSidePanelContext.Provider>
      </FilePreviewProvider>
    );
  }

  it("opens a frame in the side panel, even without a directive contentType", () => {
    const FilePreview = getFilePreviewPlugin();

    renderWithLookup({
      children: (
        <FilePreview
          path="conversation-c1/HappyTuesday.tsx"
          title="HappyTuesday.tsx"
        />
      ),
      generatedFiles: [
        {
          contentType: frameContentType,
          fileId: "fil_frame1",
          title: "HappyTuesday.tsx",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "HappyTuesday.tsx" }));

    expect(openPanel).toHaveBeenCalledWith({
      type: "interactive_content",
      fileId: "fil_frame1",
    });
    // Resolved in memory: no path-resolution request needed.
    expect(mockClientFetch).not.toHaveBeenCalled();
  });

  it("resolves a frame from earlier messages through conversation attachments", () => {
    attachmentsMock = [
      makeFileAttachment({
        contentType: frameContentType,
        fileId: "fil_from_attachments",
        hideFromUser: false,
        isInProjectContext: false,
        snippet: null,
        source: "agent",
        title: "HappyTuesday.tsx",
      }),
    ];
    const FilePreview = getFilePreviewPlugin();

    renderWithLookup({
      children: (
        <FilePreview
          path="conversation-c1/HappyTuesday.tsx"
          title="HappyTuesday.tsx"
        />
      ),
      generatedFiles: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "HappyTuesday.tsx" }));

    expect(openPanel).toHaveBeenCalledWith({
      type: "interactive_content",
      fileId: "fil_from_attachments",
    });
  });

  it("falls back to path resolution when neither the message nor attachments resolve the frame", async () => {
    const FilePreview = getFilePreviewPlugin();
    mockClientFetch.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { [DUST_FILE_ID_HEADER]: "fil_resolved_from_path" },
      })
    );

    renderWithLookup({
      children: (
        <FilePreview
          path="conversation-c1/Unknown.tsx"
          title="Unknown.tsx"
          contentType={frameContentType}
        />
      ),
      generatedFiles: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Unknown.tsx" }));

    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: "fil_resolved_from_path",
      });
    });
    expect(mockClientFetch).toHaveBeenCalledWith(
      "/api/w/w_test_ws/files/path/conversation-c1/Unknown.tsx?metadata=1",
      { method: "HEAD" }
    );
  });

  it("keeps the preview dialog for non-interactive files", async () => {
    const FilePreview = getFilePreviewPlugin();
    // The dialog's content fetch is irrelevant here (clearAllMocks does not
    // drop resolved values set by earlier tests): pin a 404 so the viewer
    // renders its error state instead of parsing a fake document.
    mockClientFetch.mockResolvedValue(new Response(null, { status: 404 }));

    renderWithLookup({
      children: (
        <FilePreview
          path="conversation-c1/report.pdf"
          title="report.pdf"
          contentType="application/pdf"
        />
      ),
      generatedFiles: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));

    expect(openPanel).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: "report.pdf" })
    ).toBeInTheDocument();
  });
});
