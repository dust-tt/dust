// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { TailwindDiagnostics } from "@viz/app/components/TailwindDiagnostics";
import { afterEach, describe, expect, it, vi } from "vitest";

const coverage = {
  buildId: "test-build",
  stylesheets: ["styles.css"],
  missingClasses: ["bg-opacity-80"],
};

afterEach(() => {
  cleanup();
  document.head.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Tailwind diagnostics", () => {
  it("reports rendered usage to the host without blocking content", async () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="/_next/static/css/styles.css">';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(coverage)))
    );
    const postMessage = vi
      .spyOn(window, "postMessage")
      .mockImplementation(() => {});
    render(
      <>
        <TailwindDiagnostics identifier="fil_test" />
        <div className="bg-opacity-80">Frame content</div>
      </>
    );
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: "TAILWIND_MISSING_CLASSES",
          identifier: "fil_test",
          buildId: "test-build",
          classNames: ["bg-opacity-80"],
        },
        "*"
      )
    );
    expect(document.body.textContent).toContain("Frame content");
  });

  it("skips reports for a different deployed stylesheet", async () => {
    document.head.innerHTML =
      '<link rel="stylesheet" href="/_next/static/css/old.css">';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(coverage)))
    );
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const { unmount } = render(<TailwindDiagnostics identifier="fil_test" />);
    // Settle the fetch and JSON promises before checking that no observer started.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(observe).not.toHaveBeenCalled();
    unmount();
  });

  it("leaves content working if the report is unavailable", async () => {
    const fetchReport = vi.fn().mockRejectedValue(new TypeError("Offline"));
    vi.stubGlobal("fetch", fetchReport);
    const postMessage = vi.spyOn(window, "postMessage");
    render(
      <>
        <TailwindDiagnostics identifier="fil_test" />
        <div>Frame content</div>
      </>
    );
    await waitFor(() => expect(fetchReport).toHaveBeenCalledOnce());
    expect(document.body.textContent).toContain("Frame content");
    expect(postMessage).not.toHaveBeenCalled();
  });
});
