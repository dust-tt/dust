import { Markdown } from "@dust-tt/sparkle";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

describe("Sparkle Markdown", () => {
  it("shows fallback when react-markdown throws and recovers on content change", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const onWindowError = (event: ErrorEvent) => {
      if (event.error instanceof Error && event.error.message === "boom") {
        event.preventDefault();
      }
    };
    window.addEventListener("error", onWindowError);

    try {
      const { rerender } = render(
        <Markdown
          content="boom"
          additionalMarkdownComponents={{
            p: () => {
              throw new Error("boom");
            },
          }}
        />
      );

      expect(
        screen.getByText("There was an error parsing this markdown content")
      ).toBeInTheDocument();
      expect(screen.getByText("boom")).toBeInTheDocument();

      rerender(<Markdown content="ok" />);

      await waitFor(() => {
        expect(
          screen.queryByText("There was an error parsing this markdown content")
        ).not.toBeInTheDocument();
      });
      expect(screen.getByText("ok")).toBeInTheDocument();
    } finally {
      window.removeEventListener("error", onWindowError);
      consoleErrorSpy.mockRestore();
    }
  });
});
