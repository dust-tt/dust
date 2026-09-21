import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownFilePreview } from "./MarkdownFilePreview";

describe("MarkdownFilePreview", () => {
  const scrollIntoView = vi.fn();
  let originalScrollIntoView: Element["scrollIntoView"];

  beforeEach(() => {
    originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.unstubAllGlobals();
  });

  it("renders heading ids from the document", async () => {
    render(
      <MarkdownFilePreview
        content={
          "# Overview\n\nKey Concepts\n============\n\n## Résumé Café\n\n## Overview"
        }
      />
    );

    const overviewHeadings = await screen.findAllByRole("heading", {
      name: "Overview",
    });
    expect(overviewHeadings[0]).toHaveAttribute("id", "overview");
    expect(
      screen.getByRole("heading", { name: "Key Concepts" })
    ).toHaveAttribute("id", "key-concepts");
    expect(
      await screen.findByRole("heading", { name: "Résumé Café" })
    ).toHaveAttribute("id", "résumé-café");
    expect(overviewHeadings[1]).toHaveAttribute("id", "overview-1");
  });

  it("scrolls preview-local anchors", async () => {
    render(
      <MarkdownFilePreview
        content={"[Résumé Café](#r%C3%A9sum%C3%A9-caf%C3%A9)\n\n## Résumé Café"}
      />
    );

    expect(
      await screen.findByRole("heading", { name: "Résumé Café" })
    ).toHaveAttribute("id", "résumé-café");
    const link = await screen.findByRole("link", { name: "Résumé Café" });

    fireEvent.click(link);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
  });

  it("keeps external links opening in a new tab", async () => {
    render(<MarkdownFilePreview content={"[Dust](https://www.dust.tt)"} />);

    const link = await screen.findByRole("link", { name: "Dust" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("opens writable Markdown directly in the editor without mode or save controls", async () => {
    render(
      <MarkdownFilePreview
        canEdit
        content="# Hello"
        onSave={async () => ({ ok: true })}
      />
    );

    expect(
      await screen.findByRole("textbox", { name: "Document content" })
    ).toHaveAttribute("contenteditable", "true");
    expect(
      screen.queryByRole("button", {
        name: /Save|Revert|Editing|Viewing|Source/,
      })
    ).not.toBeInTheDocument();
  });

  it("keeps restricted content read-only when double-clicked", async () => {
    render(<MarkdownFilePreview content="# Hello" />);
    fireEvent.doubleClick(
      await screen.findByRole("heading", { name: "Hello" })
    );
    expect(
      screen.getByRole("textbox", { name: "Document content" })
    ).toHaveAttribute("contenteditable", "false");
  });

  it("refreshes nested list content in read-only preview", async () => {
    const { rerender } = render(
      <MarkdownFilePreview content={"- item one\n- item two"} />
    );

    expect(await screen.findByText("item two")).toBeInTheDocument();

    rerender(
      <MarkdownFilePreview content={"- item one\n- updated item two"} />
    );

    expect(await screen.findByText("updated item two")).toBeInTheDocument();
    expect(screen.queryByText("item two")).not.toBeInTheDocument();
  });
});
