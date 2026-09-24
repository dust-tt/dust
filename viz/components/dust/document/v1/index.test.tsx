// @vitest-environment jsdom

import { File as NodeFile } from "node:buffer";
import type {
  DocumentComment,
  DocumentCommentReply,
} from "@dust-tt/sparkle/dist/esm/components/Document/index";
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
import type { WriteFileResult } from "@viz/app/types";
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
    <VizContext.Provider
      value={{
        isPdfMode,
        editText: null,
        addEventListener: null,
        stagedEdits: false,
        editModeActive: false,
      }}
    >
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

const thread: DocumentComment = {
  id: "thread",
  body: "Review this passage",
  author: { name: "Reviewer" },
  createdAt: "2026-09-23T10:00:00.000Z",
  resolved: false,
  replies: [],
};

const remoteReply: DocumentCommentReply = {
  id: "remote-reply",
  body: "Remote reply",
  author: { name: "Another reviewer" },
  createdAt: "2026-09-23T10:01:00.000Z",
};

const commentedDocument = (replies: DocumentCommentReply[] = []) =>
  JSON.stringify({
    type: "doc",
    attrs: { comments: [{ ...thread, replies }] },
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Original",
            marks: [{ type: "comment", attrs: { id: thread.id } }],
          },
          { type: "text", text: " text" },
        ],
      },
    ],
  });

const jsonFile = (content: string, revision = "rev-2"): FrameFile => ({
  file: new File([content], "content.json", { type: "application/json" }),
  revision,
  canWrite: true,
});

const makeCommentAPI = () => {
  const dataAPI = makeAPI();
  dataAPI.fetchFile.mockResolvedValueOnce(
    jsonFile(commentedDocument(), "rev-1")
  );
  dataAPI.fetchFile.mockResolvedValue(
    jsonFile(commentedDocument([remoteReply]))
  );
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
  return dataAPI;
};

const postReply = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /Comments/ }));
  fireEvent.click(
    await screen.findByRole("article", { name: "Comment by Reviewer" })
  );
  const input = await screen.findByRole("textbox", { name: "Reply" });
  fireEvent.change(input, { target: { value: "Local reply" } });
  fireEvent.keyDown(input, { key: "Enter" });
};

const conflict: WriteFileResult = {
  success: false,
  error: { code: "conflict", message: "File changed" },
};

beforeEach(() => {
  vi.stubGlobal("File", NodeFile);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false }))
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
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

describe("Frame comment conflict recovery", () => {
  it("saves recovered replies against the fetched revision", async () => {
    const dataAPI = makeCommentAPI();
    dataAPI.writeFile.mockResolvedValueOnce(conflict);
    render(<TestFrame dataAPI={dataAPI} />);
    await postReply();

    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    await screen.findByText("Saved");
    const recovered = dataAPI.writeFile.mock.calls[1][0];
    expect(recovered.revision).toBe("rev-2");
    expect(recovered.content).toContain("Local reply");
    expect(recovered.content).toContain("Remote reply");
    expect(screen.getByText("Local reply")).toBeTruthy();
    expect(screen.getByText("Remote reply")).toBeTruthy();
  });

  it("saves edits made during recovery separately with the acknowledged revision", async () => {
    const dataAPI = makeCommentAPI();
    const retry = Promise.withResolvers<WriteFileResult>();
    dataAPI.writeFile
      .mockResolvedValueOnce(conflict)
      .mockImplementationOnce(() => retry.promise)
      .mockResolvedValue({ success: true, revision: "rev-4" });
    render(<TestFrame dataAPI={dataAPI} />);
    await postReply();
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    paste(
      screen.getByRole("textbox", { name: "Document content" }),
      "Later edit "
    );
    await act(async () => {
      retry.resolve({ success: true, revision: "rev-3" });
    });

    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(3));
    const following = dataAPI.writeFile.mock.calls[2][0];
    expect(following.revision).toBe("rev-3");
    expect(following.content).toContain("Later edit");
    expect(following.content).toContain("Remote reply");
    expect(following.content).toContain("Local reply");
    expect(dataAPI.writeFile.mock.calls[1][0].content).not.toContain(
      "Later edit"
    );
  });

  it.each([
    "conflict",
    "save_failed",
    "rejection",
  ] as const)("preserves a recovered draft after %s and pauses until explicit retry", async (code) => {
    const dataAPI = makeCommentAPI();
    dataAPI.writeFile.mockResolvedValueOnce(conflict);
    if (code === "rejection") {
      dataAPI.writeFile.mockRejectedValueOnce(new Error("Connection lost"));
    } else {
      dataAPI.writeFile.mockResolvedValueOnce({
        success: false,
        error: { code, message: "Retry failed" },
      });
    }
    render(<TestFrame dataAPI={dataAPI} />);
    await postReply();

    await screen.findByRole("alert");
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
      );
    });
    expect(dataAPI.writeFile).toHaveBeenCalledTimes(2);
    expect(dataAPI.fetchFile).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Local reply")).toBeTruthy();
    expect(screen.getByText("Remote reply")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(3));
    expect(dataAPI.writeFile.mock.calls[2][0].revision).toBe("rev-2");
    await screen.findByText("Saved");
  });

  it("does not adopt a fetched snapshot after the local draft changes", async () => {
    const dataAPI = makeCommentAPI();
    const latest = Promise.withResolvers<FrameFile>();
    dataAPI.writeFile.mockResolvedValueOnce(conflict);
    render(<TestFrame dataAPI={dataAPI} />);
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    dataAPI.fetchFile.mockImplementationOnce(() => latest.promise);
    await postReply();
    await waitFor(() => expect(dataAPI.fetchFile).toHaveBeenCalledTimes(2));
    paste(editor, "Keep this newer edit ");
    await act(async () =>
      latest.resolve(jsonFile(commentedDocument([remoteReply])))
    );

    await screen.findByRole("alert");
    expect(dataAPI.writeFile).toHaveBeenCalledTimes(1);
    expect(editor.textContent).toContain("Keep this newer edit");
    expect(screen.getByText("Local reply")).toBeTruthy();
    expect(screen.queryByText("Remote reply")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    expect(dataAPI.writeFile.mock.calls[1][0].revision).toBe("rev-1");
  });

  it("does not adopt a conflict snapshot after the host revokes editing", async () => {
    const dataAPI = makeCommentAPI();
    const latest = Promise.withResolvers<FrameFile>();
    dataAPI.writeFile.mockResolvedValueOnce(conflict);
    const { rerender } = render(<TestFrame dataAPI={dataAPI} />);
    const editor = await screen.findByRole("textbox", {
      name: "Document content",
    });
    dataAPI.fetchFile.mockImplementationOnce(() => latest.promise);
    await postReply();
    await waitFor(() => expect(dataAPI.fetchFile).toHaveBeenCalledTimes(2));
    rerender(<TestFrame dataAPI={dataAPI} readOnly />);
    await act(async () =>
      latest.resolve(jsonFile(commentedDocument([remoteReply])))
    );

    await screen.findByRole("alert");
    expect(editor.getAttribute("contenteditable")).toBe("false");
    expect(screen.getByText("Local reply")).toBeTruthy();
    expect(screen.queryByText("Remote reply")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(dataAPI.writeFile).toHaveBeenCalledTimes(1);
    rerender(<TestFrame dataAPI={dataAPI} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(dataAPI.writeFile).toHaveBeenCalledTimes(2));
    expect(dataAPI.writeFile.mock.calls[1][0].revision).toBe("rev-1");
  });

  it.each([
    "read-only",
    "missing revision",
  ])("disables editing and keeps the unsaved draft after a %s conflict read", async (change) => {
    const dataAPI = makeCommentAPI();
    dataAPI.fetchFile.mockResolvedValue({
      ...jsonFile(commentedDocument([remoteReply])),
      canWrite: change !== "read-only",
      revision: change === "missing revision" ? null : "rev-2",
    });
    dataAPI.writeFile.mockResolvedValueOnce(conflict);
    render(<TestFrame dataAPI={dataAPI} />);
    await postReply();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your unsaved changes are still here");
    const editor = screen.getByRole("textbox", { name: "Document content" });
    expect(editor.getAttribute("contenteditable")).toBe("false");
    expect(screen.getByText("Local reply")).toBeTruthy();
    expect(screen.queryByText("Remote reply")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, AUTOSAVE_DEBOUNCE_MS * 2)
      );
    });
    expect(dataAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("preserves the draft when the latest content is invalid", async () => {
    const dataAPI = makeCommentAPI();
    dataAPI.fetchFile.mockResolvedValue(jsonFile("not json"));
    dataAPI.writeFile.mockResolvedValueOnce(conflict);
    render(<TestFrame dataAPI={dataAPI} />);
    await postReply();
    await screen.findByRole("alert");
    expect(screen.getByText("Local reply")).toBeTruthy();
    expect(dataAPI.writeFile).toHaveBeenCalledTimes(1);
  });
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

  it("preserves a conflicting text draft without adopting the fetched revision", async () => {
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
    expect(dataAPI.fetchFile).toHaveBeenCalledTimes(2);
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
