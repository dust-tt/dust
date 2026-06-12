// @vitest-environment jsdom
//
// Kit-integration acceptance gate: render the REAL
// @extend-ai/react-xlsx <XlsxViewer/> (pinned version) driven by our
// controller + the real engine (node wasm build) and assert on DOM text
// content. If a kit update breaks the seam, this suite fails.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { XlsxViewer } from "@extend-ai/react-xlsx";
import { SheetEngineClient } from "@dust/sheet-engine-client";
import { createNodeEngineHost } from "@dust/sheet-engine-worker/node-host";

import { useDustSheetController } from "../src/use-dust-sheet-controller";

const ROOT = join(__dirname, "../../..");

function corpus(rel: string): ArrayBuffer {
  const buf = readFileSync(join(ROOT, "corpus", rel));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeAll(() => {
  // jsdom has no layout: give the virtualizer a real-looking viewport.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as Record<string, unknown>).ResizeObserver ??= ResizeObserverStub;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 1200;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 800;
    },
  });
  Element.prototype.getBoundingClientRect = function () {
    return {
      width: 1200,
      height: 800,
      top: 0,
      left: 0,
      bottom: 800,
      right: 1200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  Element.prototype.scrollTo ??= () => {};
});

afterEach(() => {
  cleanup();
});

/** Unmount (closing the engine handle), then tear the client down. The node
 * host shares one wasm instance per process, so handles must be closed for
 * later tests' leak assertions to hold. */
async function finish(client: SheetEngineClient) {
  cleanup();
  await new Promise((r) => setTimeout(r, 20));
  client.destroy();
}

function Harness({
  bytes,
  fileName,
  client,
  onController,
}: {
  bytes: ArrayBuffer;
  fileName: string;
  client: SheetEngineClient;
  onController?: (c: unknown) => void;
}) {
  const src = React.useMemo(() => ({ bytes }), [bytes]);
  const { controller, loading, error, truncated } = useDustSheetController({ client, src, fileName });
  React.useEffect(() => {
    if (controller) {
      onController?.(controller);
    }
  }, [controller, onController]);
  if (error) {
    return <div data-testid="error">{error.code}</div>;
  }
  if (loading || !controller) {
    return <div data-testid="loading">loading</div>;
  }
  return (
    <div>
      {truncated ? <div data-testid="truncated-banner">File too large to fully preview</div> : null}
      <XlsxViewer controller={controller} experimentalCanvas={false} readOnly showImages={false} height={800} />
    </div>
  );
}

function newClient() {
  return new SheetEngineClient(createNodeEngineHost());
}

describe("XlsxViewer driven by the Dust engine (zero-fork, out of the box)", () => {
  it("renders xlsx cell values incl. engine-side number formatting", async () => {
    const client = newClient();
    render(<Harness bytes={corpus("gen/dates_1900.xlsx")} fileName="dates_1900.xlsx" client={client} />);

    // Formatted display strings produced by numfmt.rs, pulled through
    // getRowsBatchAsync, painted by the kit's DOM grid — including the Lotus
    // fake leap day.
    await waitFor(() => expect(screen.getAllByText("1900-02-29").length).toBeGreaterThan(0), { timeout: 10_000 });
    expect(screen.getAllByText("1900-01-01").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2023-03-15").length).toBeGreaterThan(0);
    // m/d/yy builtin (column C).
    expect(screen.getAllByText("2/29/00").length).toBeGreaterThan(0);

    await finish(client);
  });

  it("renders CSV through the same viewer", async () => {
    const client = newClient();
    render(<Harness bytes={corpus("gen/csv/simple.csv")} fileName="simple.csv" client={client} />);

    await waitFor(() => expect(screen.getAllByText("widget").length).toBeGreaterThan(0), { timeout: 10_000 });
    expect(screen.getAllByText("9.99").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1234.5").length).toBeGreaterThan(0);

    await finish(client);
  });

  it("maps engine column widths into the kit's <col> elements", async () => {
    const client = newClient();
    const { container } = render(
      <Harness bytes={corpus("gen/merges_frozen.xlsx")} fileName="merges_frozen.xlsx" client={client} />,
    );

    await waitFor(() => expect(screen.getAllByText("11").length).toBeGreaterThan(0), { timeout: 10_000 });

    // Column A: 25 chars -> 25*7+5 = 180px (+1px gridline, per the kit's
    // resolveRenderedSheetAxisPixels). Column F: 30 chars -> 215px (+1).
    // Narrow columns clamp to the kit's minimum, so they are not asserted.
    await waitFor(() => {
      const cols = Array.from(container.querySelectorAll("col"));
      const widths = cols.map((c) => (c as HTMLElement).style.width);
      expect(widths).toContain("181px");
      expect(widths).toContain("216px");
    }, { timeout: 10_000 });

    await finish(client);
  });

  it("calls getRowsBatchAsync with the viewport span and reports frozen panes", async () => {
    const client = newClient();
    const calls: Array<[number, number, number]> = [];
    let captured: { activeSheet?: { freezePanes?: { row: number; col: number } | null }; getRowsBatchAsync?: unknown } = {};

    function Spy() {
      const src = React.useMemo(() => ({ bytes: corpus("gen/merges_frozen.xlsx") }), []);
      const { controller } = useDustSheetController({ client, src, fileName: "merges_frozen.xlsx" });
      if (!controller) {
        return null;
      }
      const inner = controller as unknown as {
        getRowsBatchAsync: (a: number, b: number, c: number) => Promise<unknown[] | null>;
        activeSheet: { freezePanes: { row: number; col: number } | null };
      };
      const original = inner.getRowsBatchAsync;
      const wrapped = Object.assign({}, controller, {
        getRowsBatchAsync: (a: number, b: number, c: number) => {
          calls.push([a, b, c]);
          return original(a, b, c);
        },
      });
      captured = wrapped as typeof captured;
      return <XlsxViewer controller={wrapped as never} experimentalCanvas={false} readOnly showImages={false} />;
    }

    render(<Spy />);
    await waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 10_000 });
    const [sheetIndex, startRow, rowCount] = calls[0];
    expect(sheetIndex).toBe(0);
    expect(startRow).toBe(0);
    expect(rowCount).toBeGreaterThan(0);
    expect(captured.activeSheet?.freezePanes).toEqual({ row: 2, col: 1 });

    await finish(client);
  });

  it("multi-sheet workbooks expose tabs; hidden sheets are filtered", async () => {
    const client = newClient();
    let controller: { tabs: Array<{ name: string }>; sheets: unknown[] } | null = null;
    render(
      <Harness
        bytes={corpus("gen/multi_sheet_50.xlsx")}
        fileName="multi_sheet_50.xlsx"
        client={client}
        onController={(c) => {
          controller = c as typeof controller;
        }}
      />,
    );
    await waitFor(() => expect(controller).not.toBeNull(), { timeout: 10_000 });
    const tabs = controller!.tabs.map((t) => t.name);
    expect(tabs).toContain("Sheet01");
    expect(tabs).not.toContain("Sheet08"); // hidden (i % 10 == 7)
    expect(tabs).not.toContain("Sheet10"); // veryHidden (i % 10 == 9)
    expect(tabs.length).toBe(40);
    // The first sheet's tab is rendered in the DOM.
    await waitFor(() => expect(screen.getAllByText("Sheet01").length).toBeGreaterThan(0), { timeout: 10_000 });

    await finish(client);
  });

  it("shows the truncation banner for budget-limited files (not an error)", async () => {
    const client = newClient();
    function TruncatedHarness() {
      const src = React.useMemo(() => ({ bytes: corpus("gen/mixed_large.xlsx") }), []);
      const { controller, error, truncated } = useDustSheetController({
        client,
        src,
        fileName: "mixed_large.xlsx",
        maxCellsPerSheet: 500,
      });
      if (error) {
        return <div data-testid="error">{error.code}</div>;
      }
      if (!controller) {
        return <div>loading</div>;
      }
      return (
        <div>
          {truncated ? <div data-testid="truncated-banner">File too large to fully preview</div> : null}
          <XlsxViewer controller={controller} experimentalCanvas={false} readOnly showImages={false} />
        </div>
      );
    }
    render(<TruncatedHarness />);
    await waitFor(() => expect(screen.getByTestId("truncated-banner")).toBeDefined(), { timeout: 10_000 });
    expect(screen.queryByTestId("error")).toBeNull();

    await finish(client);
  });

  it("typed errors reach the UI (encrypted file)", async () => {
    const client = newClient();
    render(<Harness bytes={corpus("evil/encrypted.xlsx")} fileName="encrypted.xlsx" client={client} />);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("ENCRYPTED"), { timeout: 10_000 });
    await finish(client);
  });

  it("renders cell styles into the DOM (bold font, solid fill)", async () => {
    const client = newClient();
    const { container } = render(
      <Harness bytes={corpus("gen/merges_frozen.xlsx")} fileName="merges_frozen.xlsx" client={client} />,
    );
    await waitFor(() => expect(screen.getAllByText("11").length).toBeGreaterThan(0), { timeout: 10_000 });

    await waitFor(() => {
      // (row+col) % 3 == 0 cells are bold (e.g. "0" at A1); % 3 == 1 cells
      // carry the solid FF00B050 fill (e.g. "1" at B1). Inline styles are how
      // the kit paints both, so they must be findable on the cell elements.
      const styled = Array.from(container.querySelectorAll("[style]"));
      const hasBold = styled.some((el) => {
        const style = (el as HTMLElement).style;
        return (style.fontWeight === "bold" || Number(style.fontWeight) >= 600) && el.textContent === "0";
      });
      const hasFill = styled.some((el) => {
        const bg = (el as HTMLElement).style.backgroundColor.replace(/\s/g, "").toLowerCase();
        return bg === "rgb(0,176,80)" || bg === "#00b050";
      });
      expect(hasBold).toBe(true);
      expect(hasFill).toBe(true);
    }, { timeout: 10_000 });

    await finish(client);
  });

  it("renders merge spans, not just merge data", async () => {
    const client = newClient();
    const { container } = render(
      <Harness bytes={corpus("gen/merges_frozen.xlsx")} fileName="merges_frozen.xlsx" client={client} />,
    );
    await waitFor(() => expect(screen.getAllByText("11").length).toBeGreaterThan(0), { timeout: 10_000 });

    // A1:C1 is a 1x3 merge: the anchor cell must span 3 columns in the DOM.
    await waitFor(() => {
      const spanned = Array.from(container.querySelectorAll("[colspan]")).filter(
        (el) => el.getAttribute("colspan") === "3",
      );
      expect(spanned.length).toBeGreaterThan(0);
    }, { timeout: 10_000 });

    await finish(client);
  });

  it("hidden rows do not render; hidden columns are excluded from the axis", async () => {
    const client = newClient();
    let controller: { activeSheet: { visibleRows: number[]; visibleCols: number[]; hiddenCols: number[] } } | null =
      null;
    render(
      <Harness
        bytes={corpus("gen/merges_frozen.xlsx")}
        fileName="merges_frozen.xlsx"
        client={client}
        onController={(c) => {
          controller = c as typeof controller;
        }}
      />,
    );
    // Visible neighbors paint first…
    await waitFor(() => expect(screen.getAllByText("70").length).toBeGreaterThan(0), { timeout: 10_000 });
    await waitFor(() => expect(screen.getAllByText("100").length).toBeGreaterThan(0), { timeout: 10_000 });
    // …then assert hidden rows 8-9 (values 85, 95) never reach the DOM.
    expect(screen.queryByText("85")).toBeNull();
    expect(screen.queryByText("95")).toBeNull();
    // Hidden column H: the kit hides columns by collapsing their track via
    // the axis arrays (a layout effect jsdom cannot observe), so the
    // assertion lives at the axis boundary: column 7 must be excluded from
    // visibleCols and reported hidden.
    expect(controller).not.toBeNull();
    expect(controller!.activeSheet.visibleCols).not.toContain(7);
    expect(controller!.activeSheet.hiddenCols).toContain(7);
    expect(controller!.activeSheet.visibleRows).not.toContain(8);
    expect(controller!.activeSheet.visibleRows).not.toContain(9);

    await finish(client);
  });

  it("delivers sanitized hyperlinks to the kit and never an executable href", async () => {
    // The pinned kit renders cell hyperlinks from the row-batch `hyperlink`
    // field; capture exactly what it receives through the controller.
    const client = newClient();
    const seenTargets: string[] = [];

    function Spy({ bytes, fileName }: { bytes: ArrayBuffer; fileName: string }) {
      const src = React.useMemo(() => ({ bytes }), [bytes]);
      const { controller } = useDustSheetController({ client, src, fileName });
      if (!controller) {
        return null;
      }
      const inner = controller as unknown as {
        getRowsBatchAsync: (a: number, b: number, c: number) => Promise<unknown[] | null>;
      };
      const original = inner.getRowsBatchAsync;
      const wrapped = Object.assign({}, controller, {
        getRowsBatchAsync: async (a: number, b: number, c: number) => {
          const rows = await original(a, b, c);
          for (const row of (rows ?? []) as Array<{ cells: Array<{ hyperlink?: { target: string } }> }>) {
            for (const cell of row.cells) {
              if (cell.hyperlink) {
                seenTargets.push(cell.hyperlink.target);
              }
            }
          }
          return rows;
        },
      });
      return <XlsxViewer controller={wrapped as never} experimentalCanvas={false} readOnly showImages={false} />;
    }

    const { container, unmount } = render(<Spy bytes={corpus("gen/hyperlinks.xlsx")} fileName="hyperlinks.xlsx" />);
    await waitFor(() => expect(screen.getAllByText("website").length).toBeGreaterThan(0), { timeout: 10_000 });
    await waitFor(() => expect(seenTargets).toContain("https://example.com/page?x=1"), { timeout: 10_000 });
    expect(seenTargets).toContain("mailto:team@example.com");
    expect(seenTargets).toContain("#two!B2");
    void container;
    unmount();

    // Hostile file: only the safe targets reach the kit, and the rendered
    // DOM carries no executable href anywhere.
    seenTargets.length = 0;
    const { container: xss } = render(<Spy bytes={corpus("evil/xss_hyperlinks.xlsx")} fileName="xss.xlsx" />);
    await waitFor(() => expect(screen.getAllByText("good").length).toBeGreaterThan(0), { timeout: 10_000 });
    await waitFor(() => expect(seenTargets.length).toBeGreaterThan(0), { timeout: 10_000 });
    expect([...new Set(seenTargets)].sort()).toEqual(["#xss!A1", "https://example.com/safe"]);
    const banned = Array.from(xss.querySelectorAll("a[href]")).filter((a) => {
      const href = (a.getAttribute("href") ?? "").toLowerCase().replace(/[\s\x00-\x1f]/g, "");
      return (
        href.startsWith("javascript:") || href.startsWith("data:") || href.startsWith("vbscript:") || href.startsWith("file:")
      );
    });
    expect(banned).toEqual([]);

    await finish(client);
  });

  it("unmount closes the workbook handle", async () => {
    const host = createNodeEngineHost();
    const client = new SheetEngineClient(host);
    // The node host shares one wasm instance per process: count deltas.
    const baseline = host.openHandleCount();
    const { unmount } = render(
      <Harness bytes={corpus("gen/single_cell.xlsx")} fileName="single_cell.xlsx" client={client} />,
    );
    await waitFor(() => expect(screen.getAllByText("only").length).toBeGreaterThan(0), { timeout: 10_000 });
    expect(host.openHandleCount()).toBe(baseline + 1);
    unmount();
    await waitFor(() => expect(host.openHandleCount()).toBe(baseline), { timeout: 5_000 });
    await finish(client);
  });
});
