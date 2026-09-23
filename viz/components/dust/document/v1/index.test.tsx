// @vitest-environment jsdom

import { File as NodeFile } from "node:buffer";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { VizContext } from "@viz/app/components/VizContext";
import { FrameFunctionHooksProvider } from "@viz/app/lib/frame-function-hooks";
import type {
  FrameFile,
  VisualizationDataAPI,
} from "@viz/app/lib/visualization-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Document, type DocumentProps } from ".";

vi.mock("lottie-react", () => ({ default: () => null }));

const AUTOSAVE_DEBOUNCE_MS = 40;

const documentJSON = (text: string) =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

const makeFile = (
  text = "Original text",
  revision: string | null = "rev-1",
  canWrite = true
): FrameFile => ({
  file: new File([documentJSON(text)], "content.json", {
    type: "application/json",
  }),
  revision,
  canWrite,
});

const makeAPI = () => ({
  fetchFile: vi
    .fn<VisualizationDataAPI["fetchFile"]>()
    .mockResolvedValue(makeFile()),
  writeFile: vi
    .fn<VisualizationDataAPI["writeFile"]>()
    .mockResolvedValue({ success: true, revision: "rev-2" }),
  fetchCode: vi.fn<VisualizationDataAPI["fetchCode"]>(),
  callFunction: vi.fn<VisualizationDataAPI["callFunction"]>(),
  getUserIdentity: vi.fn<VisualizationDataAPI["getUserIdentity"]>(),
});

interface TestFrameProps {
  dataAPI: VisualizationDataAPI;
  path?: string;
  readOnly?: boolean;
  isPdfMode?: boolean;
  visuals?: DocumentProps["visuals"];
}

const TestFrame = ({
  dataAPI,
  path = "./content.json",
  readOnly,
  isPdfMode = false,
  visuals,
}: TestFrameProps) => (
  <FrameFunctionHooksProvider dataAPI={dataAPI}>
    <VizContext.Provider value={{ isPdfMode, editText: null }}>
      <Document
        path={path}
        readOnly={readOnly}
        visuals={visuals}
        autosaveDebounceMs={AUTOSAVE_DEBOUNCE_MS}
      />
    </VizContext.Provider>
  </FrameFunctionHooksProvider>
);

const paste = (editor: HTMLElement, text: string) => {
  fireEvent.paste(editor, {
    clipboardData: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
      files: [],
    },
  });
};

beforeEach(() => {
  vi.stubGlobal("File", NodeFile);
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Frame Document", () => {
  it("keeps visual interactions separate from document saves and preserves missing visuals", async () => {
    const dataAPI = makeAPI();
    const onVisualClick = vi.fn();
    dataAPI.fetchFile.mockResolvedValue({
      ...makeFile(),
      file: new File(
        [
          JSON.stringify({
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Draft" }] },
              { type: "dustVisual", attrs: { name: "chart" } },
              { type: "dustVisual", attrs: { name: "missing" } },
            ],
          }),
        ],
        "content.json"
      ),
    });
    render(
      <TestFrame
        dataAPI={dataAPI}
        visuals={{
          chart: <button onClick={onVisualClick}>Change chart</button>,
          missing: null,
        }}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Change chart" })
    );
    expect(onVisualClick).toHaveBeenCalledOnce();
    expect(dataAPI.writeFile).not.toHaveBeenCalled();
    expect(screen.getByText("Visual “missing” is unavailable.")).toBeTruthy();

    paste(screen.getByRole("textbox"), "Updated ");
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledOnce());
    expect(dataAPI.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('"name":"chart"'),
      })
    );
    expect(dataAPI.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('"name":"missing"'),
      })
    );
  });

  it("autosaves JSON with the loaded revision and advances it after each save", async () => {
    const dataAPI = makeAPI();
    render(<TestFrame dataAPI={dataAPI} />);
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    expect(dataAPI.writeFile).not.toHaveBeenCalled();

    paste(editor, "First edit ");
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(1));
    expect(dataAPI.writeFile).toHaveBeenLastCalledWith({
      path: "./content.json",
      revision: "rev-1",
      contentType: "application/json",
      content: expect.stringContaining("First edit"),
    });
    await screen.findByText("Saved");

    paste(editor, "Second edit ");
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    expect(dataAPI.writeFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: "rev-2" })
    );
    expect(dataAPI.fetchFile).toHaveBeenCalledTimes(1);
  });

  it("preserves a conflicting draft without refetching or replacing the revision", async () => {
    const dataAPI = makeAPI();
    dataAPI.writeFile.mockResolvedValue({
      success: false,
      error: { code: "conflict", message: "File changed" },
    });
    render(<TestFrame dataAPI={dataAPI} />);
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });

    paste(editor, "Keep this draft ");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "changed elsewhere"
    );
    paste(editor, "And this edit ");
    fireEvent(window, new Event("focus"));
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
      );
    });
    expect(editor.textContent).toContain("Keep this draft");
    expect(editor.textContent).toContain("And this edit");
    expect(dataAPI.fetchFile).toHaveBeenCalledTimes(1);
    expect(dataAPI.writeFile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    expect(dataAPI.writeFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: "rev-1" })
    );
  });

  it.each([
    {
      label: "read-only file",
      revision: "rev-1",
      canWrite: false,
      readOnly: false,
      isPdfMode: false,
    },
    {
      label: "legacy host",
      revision: null,
      canWrite: true,
      readOnly: false,
      isPdfMode: false,
    },
    {
      label: "read-only prop",
      revision: "rev-1",
      canWrite: true,
      readOnly: true,
      isPdfMode: false,
    },
    {
      label: "PDF render",
      revision: "rev-1",
      canWrite: true,
      readOnly: false,
      isPdfMode: true,
    },
  ])("disables editing for $label", async ({
    revision,
    canWrite,
    readOnly,
    isPdfMode,
  }) => {
    const dataAPI = makeAPI();
    dataAPI.fetchFile.mockResolvedValue(
      makeFile("Original text", revision, canWrite)
    );
    render(
      <TestFrame dataAPI={dataAPI} readOnly={readOnly} isPdfMode={isPdfMode} />
    );
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    expect(editor.getAttribute("contenteditable")).toBe("false");
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    expect(dataAPI.writeFile).not.toHaveBeenCalled();
  });

  it("cancels a pending autosave when the host revokes editing", async () => {
    const dataAPI = makeAPI();
    const { rerender } = render(<TestFrame dataAPI={dataAPI} />);
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    paste(editor, "Unsaved draft ");
    rerender(<TestFrame dataAPI={dataAPI} readOnly />);
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
      );
    });
    expect(editor.textContent).toContain("Unsaved draft");
    expect(editor.getAttribute("contenteditable")).toBe("false");
    expect(dataAPI.writeFile).not.toHaveBeenCalled();
  });

  it("ignores an old read after the path changes and reads fresh content when reopened", async () => {
    const dataAPI = makeAPI();
    const firstRead = Promise.withResolvers<FrameFile | null>();
    dataAPI.fetchFile
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValueOnce(makeFile("Second document"));
    const { rerender } = render(
      <TestFrame dataAPI={dataAPI} path="./first.json" />
    );
    await waitFor(() =>
      expect(dataAPI.fetchFile).toHaveBeenCalledWith("./first.json")
    );
    rerender(<TestFrame dataAPI={dataAPI} path="./second.json" />);
    expect((await screen.findByRole("textbox")).textContent).toBe(
      "Second document"
    );

    await act(async () => firstRead.resolve(makeFile("Old content")));
    expect(screen.getByRole("textbox").textContent).toBe("Second document");
    dataAPI.fetchFile.mockResolvedValueOnce(
      makeFile("Fresh first document", "rev-3")
    );
    rerender(<TestFrame dataAPI={dataAPI} path="./first.json" />);
    expect((await screen.findByRole("textbox")).textContent).toBe(
      "Fresh first document"
    );
    paste(screen.getByRole("textbox"), "New edit ");
    await waitFor(() =>
      expect(dataAPI.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: "./first.json", revision: "rev-3" })
      )
    );
  });

  it("keeps a completed save from advancing another document's revision", async () => {
    const dataAPI = makeAPI();
    const saving =
      Promise.withResolvers<
        Awaited<ReturnType<VisualizationDataAPI["writeFile"]>>
      >();
    dataAPI.writeFile.mockReturnValueOnce(saving.promise);
    const { rerender } = render(
      <TestFrame dataAPI={dataAPI} path="./first.json" />
    );
    paste(await screen.findByRole("textbox"), "First edit ");
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(1));
    dataAPI.fetchFile.mockResolvedValueOnce(
      makeFile("Second document", "second-revision")
    );
    rerender(<TestFrame dataAPI={dataAPI} path="./second.json" />);
    const editor = await screen.findByRole("textbox");
    await act(async () =>
      saving.resolve({ success: true, revision: "first-next-revision" })
    );
    paste(editor, "Second edit ");
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    expect(dataAPI.writeFile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: "./second.json",
        revision: "second-revision",
      })
    );
  });

  it("shows a failed read without creating or saving a replacement file", async () => {
    const dataAPI = makeAPI();
    dataAPI.fetchFile.mockResolvedValue(null);
    render(<TestFrame dataAPI={dataAPI} />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be loaded"
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(dataAPI.writeFile).not.toHaveBeenCalled();
  });

  it("offers commenting only to an identified workspace user", async () => {
    const dataAPI = makeAPI();
    dataAPI.getUserIdentity.mockResolvedValue({
      isAuthenticated: true,
      isWorkspaceMember: true,
      isPodEditor: false,
      isPodMember: true,
      isFrameAuthor: false,
      user: {
        sId: "user-1",
        firstName: "Maya",
        lastName: "Chen",
        fullName: "Maya Chen",
        image: null,
      },
    });
    const { unmount } = render(<TestFrame dataAPI={dataAPI} />);
    await screen.findByRole("textbox", { name: "Document content" });
    expect(
      await screen.findByRole("button", { name: /Comments/ })
    ).toBeTruthy();
    unmount();

    const anonymousAPI = makeAPI();
    anonymousAPI.getUserIdentity.mockResolvedValue({
      isAuthenticated: false,
      isWorkspaceMember: false,
      isPodEditor: false,
      isPodMember: false,
      isFrameAuthor: false,
      user: null,
    });
    render(<TestFrame dataAPI={anonymousAPI} />);
    await screen.findByRole("textbox", { name: "Document content" });
    await waitFor(() =>
      expect(anonymousAPI.getUserIdentity).toHaveBeenCalled()
    );
    expect(screen.queryByRole("button", { name: /Comments/ })).toBeNull();
  });

  it("leaves invalid stored JSON untouched", async () => {
    const dataAPI = makeAPI();
    dataAPI.fetchFile.mockResolvedValue({
      file: new File(["{broken"], "content.json"),
      revision: "rev-1",
      canWrite: true,
    });
    render(<TestFrame dataAPI={dataAPI} />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be opened"
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(dataAPI.writeFile).not.toHaveBeenCalled();
  });
});
