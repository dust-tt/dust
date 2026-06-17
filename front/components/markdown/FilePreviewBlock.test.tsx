import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import {
  getFilePreviewDirectivePaths,
  getFilePreviewMarkdownDirective,
} from "@app/lib/markdown/file_preview";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { filePreviewDirective, getFilePreviewPlugin } from "./FilePreviewBlock";

const mockOwner = LightWorkspaceFactory.build({
  sId: "w_test_ws",
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

    fireEvent.click(screen.getByText("report final.pdf"));

    expect(
      await screen.findByRole("dialog", { name: "report final.pdf" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download" })
    ).toBeInTheDocument();
  });

  it("infers the file name from the scoped path when metadata is absent", () => {
    const FilePreview = getFilePreviewPlugin();

    render(<FilePreview path="conversation-c1/exports/data.csv" />);

    expect(screen.getByText("data.csv")).toBeInTheDocument();
  });
});
