import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IconForAttachmentCitation } from "./utils";

// Mocks
vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("@app/lib/connector_providers", () => ({
  CONNECTOR_CONFIGURATIONS: {
    google_drive: {},
    github: {},
  },
}));

vi.mock("@app/lib/connector_providers_ui", () => ({
  CONNECTOR_UI_CONFIGURATIONS: {
    google_drive: {},
    github: {},
  },
  getConnectorProviderLogoWithFallback: ({
    provider,
    isDark,
  }: {
    provider: string;
    isDark: boolean;
  }) => `ProviderLogo(${provider},${isDark})`,
}));

vi.mock(
  "@app/components/assistant/conversation/input_bar/pasted_utils",
  () => ({
    isPastedFile: (ct: string) => ct === "application/x-pasted",
    getDisplayNameFromPastedFileId: (s: string) => s,
    getDisplayDateFromPastedFileId: (_s: string) => undefined,
  })
);

// Mock sparkle icon components and wrappers with light-weight test doubles.
vi.mock("@dust-tt/sparkle", () => ({
  // Visual icon identifiers
  ActionVolumeUpIcon: "ActionVolumeUpIcon",
  DocumentIcon: "DocumentIcon",
  DoubleQuotesIcon: "DoubleQuotesIcon",
  FolderIcon: "FolderIcon",
  ImageIcon: "ImageIcon",
  TableIcon: "TableIcon",

  // Components used by the implementation
  Icon: ({ visual, size }: { visual: unknown; size?: string }) => (
    <div
      data-testid="icon"
      data-visual={String(visual)}
      data-size={size ?? ""}
    />
  ),
  DoubleIcon: ({
    mainIcon,
    secondaryIcon,
    size,
  }: {
    mainIcon: unknown;
    secondaryIcon: unknown;
    size?: string;
  }) => (
    <div
      data-testid="double-icon"
      data-main={String(mainIcon)}
      data-secondary={String(secondaryIcon)}
      data-size={size ?? ""}
    />
  ),
  FaviconIcon: ({
    websiteUrl,
    className,
  }: {
    websiteUrl?: string;
    className?: string;
  }) => (
    <div
      data-testid="favicon"
      data-website-url={websiteUrl ?? ""}
      data-class={className ?? ""}
    />
  ),
}));

// A small wrapper component to render the function that returns a ReactNode.
function TestIcon(props: {
  provider?: string;
  nodeType?: any; // keep it lax for the test environment
  contentType?: string;
  sourceUrl?: string;
}) {
  return <>{IconForAttachmentCitation(props)}</>;
}

describe("IconForAttachmentCitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders FaviconIcon when provider is webcrawler", () => {
    render(
      <TestIcon provider="webcrawler" sourceUrl="https://example.com/article" />
    );
    const el = screen.getByTestId("favicon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute(
      "data-website-url",
      "https://example.com/article"
    );
  });

  it("renders DoubleIcon with TableIcon for connector nodeType = table", () => {
    render(<TestIcon provider="google_drive" nodeType="table" />);
    const el = screen.getByTestId("double-icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-main", "TableIcon");
    // Comes from our getConnectorProviderLogoWithFallback mock and ThemeContext isDark=false
    expect(el).toHaveAttribute(
      "data-secondary",
      "ProviderLogo(google_drive,false)"
    );
    expect(el).toHaveAttribute("data-size", "md");
  });

  it("renders DoubleIcon with FolderIcon for connector nodeType = folder", () => {
    render(<TestIcon provider="google_drive" nodeType="folder" />);
    const el = screen.getByTestId("double-icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-main", "FolderIcon");
    expect(el).toHaveAttribute(
      "data-secondary",
      "ProviderLogo(google_drive,false)"
    );
  });

  it("renders DoubleIcon with DocumentIcon for connector nodeType = other", () => {
    render(<TestIcon provider="github" nodeType="file" />);
    const el = screen.getByTestId("double-icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-main", "DocumentIcon");
    expect(el).toHaveAttribute("data-secondary", "ProviderLogo(github,false)");
  });

  it("renders DoubleIcon with DocumentIcon for connector nodeType = null", () => {
    render(<TestIcon provider="github" nodeType="null" />);
    const el = screen.getByTestId("double-icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-main", "DocumentIcon");
    expect(el).toHaveAttribute("data-secondary", "ProviderLogo(github,false)");
  });

  it("renders Image icon for image/* content types", () => {
    render(<TestIcon contentType="image/jpeg" />);
    const el = screen.getByTestId("icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-visual", "ImageIcon");
  });

  it("renders ActionVolumeUp icon for audio/* content types", () => {
    render(<TestIcon contentType="audio/wav" />);
    const el = screen.getByTestId("icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-visual", "ActionVolumeUpIcon");
  });

  it("renders DoubleQuotes icon for pasted file content type", () => {
    render(<TestIcon contentType="application/x-pasted" />);
    const el = screen.getByTestId("icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-visual", "DoubleQuotesIcon");
  });

  it("renders default Document icon when nothing matches", () => {
    render(<TestIcon provider="unknown-provider" />);
    const el = screen.getByTestId("icon");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-visual", "DocumentIcon");
  });
});
