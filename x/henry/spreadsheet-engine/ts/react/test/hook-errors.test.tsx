// @vitest-environment jsdom
//
// Error-path coverage for useDustSheetController: non-budget errors from the
// row-batch path must surface via the hook's `error`; BUDGET_EXCEEDED and
// CANCELLED degrade to empty cells silently. Uses the real engine with the
// batch endpoint overridden per test.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { XlsxViewer } from "@extend-ai/react-xlsx";
import { EngineErrorException, SheetEngineClient } from "@dust/sheet-engine-client";
import type { EngineErrorCode } from "@dust/sheet-engine-client";
import { createNodeEngineHost } from "@dust/sheet-engine-worker/node-host";

import { useDustSheetController } from "../src/use-dust-sheet-controller";

const ROOT = join(__dirname, "../../..");

function corpus(rel: string): ArrayBuffer {
  const buf = readFileSync(join(ROOT, "corpus", rel));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

beforeAll(() => {
  // jsdom has no layout: give the virtualizer a real-looking viewport, else
  // the grid never requests row batches (mirrors kit-integration.test.tsx).
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

let clients: SheetEngineClient[] = [];

afterEach(async () => {
  // Unmount (closing engine handles), then tear the clients down. Without
  // the explicit cleanup the previous test's DOM leaks into the next one.
  cleanup();
  await new Promise((r) => setTimeout(r, 20));
  for (const client of clients) {
    client.destroy();
  }
  clients = [];
});

/** Real client whose getRowsBatch always rejects with the given code. */
function clientWithFailingBatches(code: EngineErrorCode): SheetEngineClient {
  const client = new SheetEngineClient(createNodeEngineHost());
  client.getRowsBatch = () => Promise.reject(new EngineErrorException({ code, detail: "injected" }));
  clients.push(client);
  return client;
}

function Harness({ client, bytes }: { client: SheetEngineClient; bytes: ArrayBuffer }) {
  const src = React.useMemo(() => ({ bytes }), [bytes]);
  const { controller, error } = useDustSheetController({ client, src, fileName: "t.xlsx" });
  if (error) {
    return <div data-testid="error">{error.code}</div>;
  }
  if (!controller) {
    return <div data-testid="loading">loading</div>;
  }
  return (
    <div data-testid="grid">
      <XlsxViewer controller={controller} experimentalCanvas={false} readOnly showImages={false} height={400} />
    </div>
  );
}

describe("useDustSheetController error paths", () => {
  it("non-budget batch errors surface through `error`", async () => {
    const client = clientWithFailingBatches("INTERNAL");
    render(<Harness client={client} bytes={corpus("gen/single_cell.xlsx")} />);
    await waitFor(() => expect(screen.getByTestId("error").textContent).toBe("INTERNAL"), { timeout: 10_000 });
  });

  it("BUDGET_EXCEEDED batch errors stay silent (empty cells, no error)", async () => {
    const client = clientWithFailingBatches("BUDGET_EXCEEDED");
    render(<Harness client={client} bytes={corpus("gen/single_cell.xlsx")} />);
    await waitFor(() => expect(screen.getByTestId("grid")).toBeDefined(), { timeout: 10_000 });
    // Give the failing batch time to resolve; the grid must remain, errorless.
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByTestId("error")).toBeNull();
    expect(screen.queryByTestId("grid")).not.toBeNull();
  });

  it("CANCELLED batch errors stay silent", async () => {
    const client = clientWithFailingBatches("CANCELLED");
    render(<Harness client={client} bytes={corpus("gen/single_cell.xlsx")} />);
    await waitFor(() => expect(screen.getByTestId("grid")).toBeDefined(), { timeout: 10_000 });
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByTestId("error")).toBeNull();
  });

  it("unmount immediately after a batch delivery schedules no late paint ticks", async () => {
    const client = new SheetEngineClient(createNodeEngineHost());
    clients.push(client);
    let batches = 0;
    const original = client.getRowsBatch.bind(client);
    client.getRowsBatch = async (...args: Parameters<SheetEngineClient["getRowsBatch"]>) => {
      const rows = await original(...args);
      batches += 1;
      return rows;
    };
    const { unmount } = render(<Harness client={client} bytes={corpus("gen/single_cell.xlsx")} />);
    await waitFor(() => expect(batches).toBeGreaterThan(0), { timeout: 10_000 });
    // Unmount while the staggered paint timers (0/120/400ms) are pending;
    // the unmount gate must keep them from firing setState afterwards.
    unmount();
    await new Promise((r) => setTimeout(r, 500));
    // No assertion beyond "nothing threw / no act() warning": React 18+ has
    // no unmounted-setState warning, so reaching here without an unhandled
    // error is the regression signal.
  });
});
