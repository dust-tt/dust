import { useFrameFiles } from "@app/lib/swr/frame_files";
import { DUST_FILE_CAN_WRITE_HEADER } from "@app/types/files";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { clientFetch } = vi.hoisted(() => ({ clientFetch: vi.fn() }));
vi.mock("@app/lib/egress/client", () => ({ clientFetch }));

const options = {
  workspaceId: "w_test",
  packageRoot: "conversation-c_test/report",
  canWrite: true,
};

const edit = {
  path: "./notes.json",
  content: '{"text":"updated"}',
  contentType: "application/json",
  revision: '"123"',
};

beforeEach(() => {
  clientFetch.mockReset();
});

describe("Frame file access", () => {
  it("reads a package file and saves with its exact revision", async () => {
    clientFetch.mockResolvedValueOnce(
      new Response("{}", {
        headers: {
          "Content-Type": "application/json",
          ETag: '"123"',
          [DUST_FILE_CAN_WRITE_HEADER]: "true",
        },
      })
    );
    const { result } = renderHook(() => useFrameFiles(options));
    const loaded = await result.current.readFile(edit.path);
    expect(loaded.revision).toBe(edit.revision);
    expect(loaded.canWrite).toBe(true);
    expect(loaded.fileBlob).toMatchObject({
      size: 2,
      type: "application/json",
    });

    clientFetch.mockResolvedValueOnce(
      new Response(null, { headers: { ETag: '"124"' } })
    );
    await expect(result.current.writeFile(edit)).resolves.toEqual({
      success: true,
      revision: '"124"',
    });
    expect(clientFetch).toHaveBeenLastCalledWith(
      "/api/w/w_test/files/path/conversation-c_test/report/notes.json",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": '"123"' },
        body: edit.content,
      }
    );
  });

  it("encodes package paths and keeps files without revision metadata read-only", async () => {
    clientFetch.mockResolvedValue(new Response("{}"));
    const { result } = renderHook(() => useFrameFiles(options));
    const file = await result.current.readFile("./draft notes.json");
    expect(clientFetch).toHaveBeenCalledWith(
      "/api/w/w_test/files/path/conversation-c_test/report/draft%20notes.json"
    );
    expect(file.canWrite).toBe(false);
  });

  it.each([
    "../outside.json",
    "conversation-c_test/other/notes.json",
    "conversation-c_test/report/../outside.json",
    "conversation-c_test/report/sub/../../outside.json",
    "pod-p_other/report/notes.json",
    "fil_existing",
  ])("rejects writes outside the Frame package: %s", async (path) => {
    const { result } = renderHook(() => useFrameFiles(options));
    await expect(
      result.current.writeFile({ ...edit, path })
    ).resolves.toMatchObject({
      success: false,
      error: { code: "invalid_path" },
    });
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it.each([
    "report.v2",
    "manifest.json",
  ])("preserves the package directory %s", async (folderName) => {
    const { result } = renderHook(() =>
      useFrameFiles({
        ...options,
        packageRoot: `conversation-c_test/${folderName}`,
      })
    );
    clientFetch.mockResolvedValue(
      new Response(null, { headers: { ETag: '"124"' } })
    );
    await result.current.writeFile(edit);
    expect(clientFetch).toHaveBeenCalledWith(
      `/api/w/w_test/files/path/conversation-c_test/${folderName}/notes.json`,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("returns conflicts without retrying the write", async () => {
    clientFetch.mockResolvedValue(new Response(null, { status: 412 }));
    const { result } = renderHook(() => useFrameFiles(options));
    await expect(result.current.writeFile(edit)).resolves.toMatchObject({
      success: false,
      error: { code: "conflict" },
    });
    expect(clientFetch).toHaveBeenCalledTimes(1);
  });

  it("revokes writing when the host becomes read-only", async () => {
    const { result, rerender } = renderHook(
      (canWrite: boolean) => useFrameFiles({ ...options, canWrite }),
      { initialProps: true }
    );
    rerender(false);
    await expect(result.current.writeFile(edit)).resolves.toMatchObject({
      success: false,
      error: { code: "read_only" },
    });
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])("respects API write permission %s", async (canWrite) => {
    clientFetch.mockResolvedValue(
      new Response("{}", {
        headers: {
          ETag: '"123"',
          [DUST_FILE_CAN_WRITE_HEADER]: String(canWrite),
        },
      })
    );
    const { result } = renderHook(() => useFrameFiles(options));
    await expect(result.current.readFile(edit.path)).resolves.toMatchObject({
      canWrite,
    });
  });

  it("does not confirm a save if the response omits its revision", async () => {
    clientFetch.mockResolvedValue(new Response(null));
    const { result } = renderHook(() => useFrameFiles(options));
    await expect(result.current.writeFile(edit)).resolves.toMatchObject({
      success: false,
      error: { code: "save_failed" },
    });
  });

  it("surfaces permissions revoked by the file API", async () => {
    clientFetch.mockResolvedValue(new Response(null, { status: 403 }));
    const { result } = renderHook(() => useFrameFiles(options));
    await expect(result.current.writeFile(edit)).resolves.toMatchObject({
      success: false,
      error: { code: "read_only" },
    });
  });
});
