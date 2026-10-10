// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mermaid } from ".";

const FLOWCHART = "flowchart LR\n A --> B";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

describe("Mermaid", () => {
  beforeEach(() => {
    mermaidMock.parse.mockResolvedValue(true);
    mermaidMock.render.mockResolvedValue({
      svg: "<svg data-testid='diagram' />",
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
    vi.clearAllMocks();
  });

  it("renders the SVG returned by mermaid", async () => {
    render(<Mermaid chart={FLOWCHART} />);

    await screen.findByTestId("diagram");
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-/),
      "flowchart LR\n A --> B"
    );
  });

  it("uses the strict security level", async () => {
    render(<Mermaid chart={FLOWCHART} />);

    await screen.findByTestId("diagram");
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict" })
    );
  });

  it("shows the parse error instead of throwing on invalid source", async () => {
    mermaidMock.parse.mockRejectedValue(new Error("Parse error on line 2"));

    render(<Mermaid chart="not a diagram" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Parse error on line 2");
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it.each([
    [false, "#ffffff"],
    [true, "#0a0a0a"],
  ])("themes the diagram when dark is %s", async (isDark, background) => {
    document.documentElement.classList.toggle("dark", isDark);

    render(<Mermaid chart={FLOWCHART} />);

    await waitFor(() => expect(mermaidMock.initialize).toHaveBeenCalled());
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        themeVariables: expect.objectContaining({ background }),
      })
    );
  });
});
