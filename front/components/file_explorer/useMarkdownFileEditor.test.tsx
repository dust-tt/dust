import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Cache } from "swr";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    asPath: "/files",
    events: { on: vi.fn(), off: vi.fn() },
  }),
  useNavigationBlocker: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
const owner = LightWorkspaceFactory.build();
const initialProps = {
  category: "markdown" as const,
  entryPath: "conversation-abc/plan.md",
  fileUrl: "/plan.md",
  isActive: true,
  isContentLoading: false,
  isTooLarge: false,
  owner,
  canEdit: true,
  processedContent: { text: "# Original", format: "markdown" as const },
};

interface WrapperProps {
  children: ReactNode;
}
const Wrapper = ({ children }: WrapperProps) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => vi.unstubAllGlobals());

describe("useMarkdownFileEditor", () => {
  it("opens a new document when a clean file refreshes", () => {
    const { result, rerender } = renderHook(useMarkdownFileEditor, {
      initialProps,
      wrapper: Wrapper,
    });
    const documentKey = result.current.documentKey;

    rerender({
      ...initialProps,
      processedContent: { text: "# Updated by an agent", format: "markdown" },
    });

    expect(result.current.content).toBe("# Updated by an agent");
    expect(result.current.documentKey).not.toBe(documentKey);
    expect(result.current.isDirty).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves plain Markdown without remounting the document on its own refresh", async () => {
    const { result, rerender } = renderHook(useMarkdownFileEditor, {
      initialProps,
      wrapper: Wrapper,
    });
    const documentKey = result.current.documentKey;
    const markdown = "# Updated\n\n**Keep the Markdown.**";
    act(() => result.current.setDocumentDirty(true));
    await act(async () => {
      expect(await result.current.saveContent(markdown)).toEqual({ ok: true });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/files/path/conversation-abc/plan.md"),
      expect.objectContaining({
        method: "PUT",
        body: markdown,
        headers: { "Content-Type": "text/markdown" },
      })
    );
    act(() => result.current.setDocumentDirty(false));
    rerender({
      ...initialProps,
      processedContent: { text: markdown, format: "markdown" },
    });
    expect(result.current.content).toBe(markdown);
    expect(result.current.documentKey).toBe(documentKey);
    expect(result.current.isDirty).toBe(false);
  });

  it("keeps the document dirty when persistence fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Connection lost"));
    const { result } = renderHook(useMarkdownFileEditor, {
      initialProps,
      wrapper: Wrapper,
    });
    act(() => result.current.setDocumentDirty(true));
    await act(async () => {
      expect(await result.current.saveContent("My unsaved draft")).toEqual({
        ok: false,
        error: "Connection lost",
      });
    });
    expect(result.current.content).toBe("# Original");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.isSaving).toBe(false);
  });

  it("clears saving when the cache update rejects after a write", async () => {
    const cache: Cache = new Map();
    const { result } = renderHook(useMarkdownFileEditor, {
      initialProps,
      wrapper: ({ children }: WrapperProps) => (
        <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
      ),
    });
    act(() => result.current.setDocumentDirty(true));
    vi.spyOn(cache, "set").mockImplementationOnce(() => {
      throw new Error("Cache update failed");
    });

    await act(async () => {
      await expect(
        result.current.saveContent("Keep this draft")
      ).rejects.toThrow("Cache update failed");
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.isDirty).toBe(true);
  });

  it("does not apply an earlier file's save to a newly opened document", async () => {
    const response = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const { result, rerender } = renderHook(useMarkdownFileEditor, {
      initialProps,
      wrapper: Wrapper,
    });
    let pending: ReturnType<typeof result.current.saveContent> | undefined;
    act(() => {
      pending = result.current.saveContent("First file edit");
    });
    rerender({
      ...initialProps,
      entryPath: "conversation-abc/other.md",
      fileUrl: "/other.md",
      processedContent: { text: "# Other document", format: "markdown" },
    });
    const documentKey = result.current.documentKey;
    await act(async () => {
      response.resolve(new Response(null, { status: 200 }));
      await pending;
    });
    expect(result.current.content).toBe("# Other document");
    expect(result.current.documentKey).toBe(documentKey);
    expect(result.current.isSaving).toBe(false);
  });

  it("preserves a dirty document on refresh and respects revoked permissions", async () => {
    const { result, rerender } = renderHook(useMarkdownFileEditor, {
      initialProps,
      wrapper: Wrapper,
    });
    const documentKey = result.current.documentKey;
    const saveContent = result.current.saveContent;
    act(() => result.current.setDocumentDirty(true));
    rerender({
      ...initialProps,
      canEdit: false,
      processedContent: { text: "Remote update", format: "markdown" },
    });
    expect(result.current.content).toBe("# Original");
    expect(result.current.documentKey).toBe(documentKey);
    expect(result.current.canEdit).toBe(false);
    await act(async () => {
      expect(await saveContent("Forbidden edit")).toEqual({
        ok: false,
        error: "This file is read-only.",
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
