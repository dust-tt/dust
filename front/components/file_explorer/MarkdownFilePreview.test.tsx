import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownFilePreview } from "./MarkdownFilePreview";

describe("MarkdownFilePreview", () => {
  const scrollIntoView = vi.fn();
  let originalScrollIntoView: Element["scrollIntoView"];

  beforeEach(() => {
    originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("renders heading ids from the markdown AST", () => {
    render(
      <MarkdownFilePreview
        content={
          "# Overview\n\nKey Concepts\n============\n\n## Résumé Café\n\n## Overview"
        }
        viewMode="preview"
      />
    );

    const overviewHeadings = screen.getAllByRole("heading", {
      name: "Overview",
    });
    expect(overviewHeadings[0]).toHaveAttribute("id", "overview");
    expect(
      screen.getByRole("heading", { name: "Key Concepts" })
    ).toHaveAttribute("id", "key-concepts");
    expect(
      screen.getByRole("heading", { name: "Résumé Café" })
    ).toHaveAttribute("id", "résumé-café");
    expect(overviewHeadings[1]).toHaveAttribute("id", "overview-1");
  });

  it("scrolls preview-local anchors", () => {
    render(
      <MarkdownFilePreview
        content={"[Résumé Café](#r%C3%A9sum%C3%A9-caf%C3%A9)\n\n## Résumé Café"}
        viewMode="preview"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Résumé Café" })
    ).toHaveAttribute("id", "résumé-café");
    const link = screen.getByRole("link", { name: "Résumé Café" });
    expect(link).toHaveAttribute("target", "_self");

    fireEvent.click(link);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("keeps external links opening in a new tab", () => {
    render(
      <MarkdownFilePreview
        content={"[Dust](https://www.dust.tt)"}
        viewMode="preview"
      />
    );

    const link = screen.getByRole("link", { name: "Dust" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("switches to edit mode when double-clicking preview content", () => {
    const onViewModeChange = vi.fn();

    render(
      <MarkdownFilePreview
        canEdit
        content={"# Hello\n\nClick me"}
        viewMode="preview"
        onViewModeChange={onViewModeChange}
      />
    );

    fireEvent.doubleClick(screen.getByRole("heading", { name: "Hello" }));

    expect(onViewModeChange).toHaveBeenCalledWith("edit");
  });

  it("does not switch to edit mode when double-clicking a link", () => {
    const onViewModeChange = vi.fn();

    render(
      <MarkdownFilePreview
        canEdit
        content={"[Dust](https://www.dust.tt)"}
        viewMode="preview"
        onViewModeChange={onViewModeChange}
      />
    );

    fireEvent.doubleClick(screen.getByRole("link", { name: "Dust" }));

    expect(onViewModeChange).not.toHaveBeenCalled();
  });

  it("updates nested list content in preview without remounting", () => {
    const { rerender } = render(
      <MarkdownFilePreview
        content={"- item one\n- item two"}
        viewMode="preview"
      />
    );

    expect(screen.getByText("item two")).toBeInTheDocument();

    rerender(
      <MarkdownFilePreview
        content={"- item one\n- updated item two"}
        viewMode="preview"
      />
    );

    expect(screen.getByText("updated item two")).toBeInTheDocument();
    expect(screen.queryByText("item two")).not.toBeInTheDocument();
  });
});
