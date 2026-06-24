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
    render(<MarkdownFilePreview content={"[Dust](https://www.dust.tt)"} />);

    const link = screen.getByRole("link", { name: "Dust" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
