import { useFrameFiles } from "@app/lib/swr/frame_files";
import {
  DUST_FILE_CAN_WRITE_HEADER,
  DUST_FILE_REVISION_HEADER,
  DUST_IF_REVISION_MATCH_HEADER,
} from "@app/types/files";
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
  revision: "123",
};

beforeEach(() => {
  clientFetch.mockReset();
});

describe("Frame file access", () => {
  it.each([
    [
      "conversation-c_test/notes.json",
      "/api/w/w_test/files/path/conversation-c_test/notes.json",
    ],
    [
      "pod-p_test/draft notes.json",
      "/api/w/w_test/files/path/pod-p_test/draft%20notes.json",
    ],
    [
      "conversation/notes.json",
      "/api/w/w_test/files/path/conversation-c_test/notes.json",
    ],
    ["pod/notes.json", "/api/w/w_test/files/path/pod-p_test/notes.json"],
    ["project/notes.json", "/api/w/w_test/files/path/pod-p_test/notes.json"],
  ])(
    "preserves reads by %s without granting writes outside the package",
    async (path, url) => {
      clientFetch.mockResolvedValue(
        new Response("{}", {
          headers: {
            [DUST_FILE_REVISION_HEADER]: "123",
            [DUST_FILE_CAN_WRITE_HEADER]: "true",
          },
        })
      );
      const { result } = renderHook(() =>
        useFrameFiles({
          ...options,
          conversationId: "c_test",
          spaceId: "p_test",
        })
      );

      await expect(result.current.readFile(path)).resolves.toMatchObject({
        fileBlob: expect.any(Blob),
        canWrite: false,
      });
      expect(clientFetch).toHaveBeenCalledExactlyOnceWith(url);
    }
  );

  it.each([
    "../assistant/conversations?",
    "../../w_other/members?",
    "./.\x01./outside.json",
    "conversation-c_test/report/.\x7f./outside.json",
    "pod-p_test/../../../assistant/conversations",
    "conversation-c_test/report/../../../members",
    "conversation/../notes.json",
    "pod/../../notes.json",
    "project/./notes.json",
    "conversation-c_test//notes.json",
    "fil_abc123def456?action=download",
    "fil_short",
    "",
  ])(
    "never fetches when the identifier would change the route: %s",
    async (fileId) => {
      const { result } = renderHook(() =>
        useFrameFiles({
          ...options,
          conversationId: "c_test",
          spaceId: "p_test",
        })
      );

      await expect(result.current.readFile(fileId)).resolves.toEqual({
        fileBlob: null,
      });
      expect(clientFetch).not.toHaveBeenCalled();
    }
  );

  it.each([
    "conversation-c_other/notes.json",
    "pod-p_other/notes.json",
    "conversation-c_test",
    "pod-p_test",
  ])(
    "never fetches scoped paths outside the Frame context: %s",
    async (fileId) => {
      const { result } = renderHook(() =>
        useFrameFiles({
          ...options,
          conversationId: "c_test",
          spaceId: "p_test",
        })
      );

      await expect(result.current.readFile(fileId)).resolves.toEqual({
        fileBlob: null,
      });
      expect(clientFetch).not.toHaveBeenCalled();
    }
  );

  describe("host without a conversation or Pod", () => {
    it("reads inside the package root", async () => {
      clientFetch.mockResolvedValue(new Response("{}"));
      const { result } = renderHook(() => useFrameFiles(options));

      await expect(
        result.current.readFile("conversation-c_test/report/data.json")
      ).resolves.toMatchObject({ fileBlob: expect.any(Blob) });
      expect(clientFetch).toHaveBeenCalledExactlyOnceWith(
        "/api/w/w_test/files/path/conversation-c_test/report/data.json"
      );
    });

    it.each([
      "conversation-c_test/other.json",
      "conversation/other.json",
      "pod/other.json",
    ])("never fetches %s outside the package root", async (fileId) => {
      const { result } = renderHook(() => useFrameFiles(options));

      await expect(result.current.readFile(fileId)).resolves.toEqual({
        fileBlob: null,
      });
      expect(clientFetch).not.toHaveBeenCalled();
    });

    it.each([401, 404])(
      "never fetches content when the allowlist endpoint answers %s",
      async (status) => {
        clientFetch.mockResolvedValueOnce(new Response(null, { status }));
        const { result } = renderHook(() =>
          useFrameFiles({ ...options, frameFileId: "fil_frame000001" })
        );

        await expect(
          result.current.readFile("pod-p_other/data.csv")
        ).resolves.toEqual({ fileBlob: null });
        expect(clientFetch).toHaveBeenCalledExactlyOnceWith(
          "/api/w/w_test/frames/fil_frame000001/authorized-files"
        );
      }
    );

    it("never fetches a file id", async () => {
      const { result } = renderHook(() => useFrameFiles(options));

      await expect(
        result.current.readFile("fil_abc123def456")
      ).resolves.toEqual({ fileBlob: null });
      expect(clientFetch).not.toHaveBeenCalled();
    });
  });

  describe("allowlisted reads outside the Frame context", () => {
    const allowlistUrl =
      "/api/w/w_test/frames/fil_frame000001/authorized-files";
    const refs = [
      { kind: "file_id", ref: "fil_abc123def456" },
      {
        kind: "canonical_path",
        ref: "pod-p_other/data.csv",
        legacyPath: "project/data.csv",
      },
    ];

    const renderAllowlistedHook = () =>
      renderHook(() =>
        useFrameFiles({
          ...options,
          conversationId: "c_test",
          spaceId: "p_test",
          frameFileId: "fil_frame000001",
        })
      );

    it("reads an allowlisted path from another Pod", async () => {
      clientFetch
        .mockResolvedValueOnce(Response.json({ refs }))
        .mockResolvedValueOnce(new Response("{}"));
      const { result } = renderAllowlistedHook();

      await expect(
        result.current.readFile("pod-p_other/data.csv")
      ).resolves.toMatchObject({ fileBlob: expect.any(Blob) });
      expect(clientFetch).toHaveBeenNthCalledWith(1, allowlistUrl);
      expect(clientFetch).toHaveBeenNthCalledWith(
        2,
        "/api/w/w_test/files/path/pod-p_other/data.csv"
      );
    });

    it("reads an allowlisted file id without a metadata lookup", async () => {
      clientFetch
        .mockResolvedValueOnce(Response.json({ refs }))
        .mockResolvedValueOnce(new Response("{}"));
      const { result } = renderAllowlistedHook();

      await expect(
        result.current.readFile("fil_abc123def456")
      ).resolves.toMatchObject({ fileBlob: expect.any(Blob) });
      expect(clientFetch).toHaveBeenCalledTimes(2);
      expect(clientFetch).toHaveBeenLastCalledWith(
        "/api/w/w_test/files/fil_abc123def456?action=view"
      );
    });

    it("fetches the allowlist once per Frame", async () => {
      clientFetch
        .mockResolvedValueOnce(Response.json({ refs }))
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(new Response("{}"));
      const { result } = renderAllowlistedHook();

      await result.current.readFile("pod-p_other/data.csv");
      await result.current.readFile("fil_abc123def456");
      expect(
        clientFetch.mock.calls.filter(([url]) => url === allowlistUrl)
      ).toHaveLength(1);
    });

    it("refreshes the allowlist when the Frame's code changes under the same id", async () => {
      const { result, rerender } = renderHook(
        (frameContent: string) =>
          useFrameFiles({
            ...options,
            conversationId: "c_test",
            spaceId: "p_test",
            frameFileId: "fil_frame000001",
            frameContent,
          }),
        { initialProps: 'useFile("pod-p_other/old.csv")' }
      );
      clientFetch
        .mockResolvedValueOnce(
          Response.json({
            refs: [{ kind: "canonical_path", ref: "pod-p_other/old.csv" }],
          })
        )
        .mockResolvedValueOnce(new Response("{}"));
      await expect(
        result.current.readFile("pod-p_other/old.csv")
      ).resolves.toMatchObject({ fileBlob: expect.any(Blob) });

      rerender('useFile("pod-p_other/new.csv")');
      clientFetch.mockClear();
      clientFetch
        .mockResolvedValueOnce(
          Response.json({
            refs: [{ kind: "canonical_path", ref: "pod-p_other/new.csv" }],
          })
        )
        .mockResolvedValueOnce(new Response("{}"));

      await expect(
        result.current.readFile("pod-p_other/old.csv")
      ).resolves.toEqual({ fileBlob: null });
      await expect(
        result.current.readFile("pod-p_other/new.csv")
      ).resolves.toMatchObject({ fileBlob: expect.any(Blob) });
      expect(
        clientFetch.mock.calls.filter(([url]) => url === allowlistUrl)
      ).toHaveLength(1);
      expect(clientFetch).toHaveBeenLastCalledWith(
        "/api/w/w_test/files/path/pod-p_other/new.csv"
      );
    });

    it("never fetches an out-of-scope path that is not allowlisted", async () => {
      clientFetch.mockResolvedValueOnce(Response.json({ refs }));
      const { result } = renderAllowlistedHook();

      await expect(
        result.current.readFile("pod-p_other/secret.csv")
      ).resolves.toEqual({ fileBlob: null });
      expect(clientFetch).toHaveBeenCalledExactlyOnceWith(allowlistUrl);
    });

    it("still refuses route-changing identifiers that appear allowlisted", async () => {
      clientFetch.mockResolvedValueOnce(
        Response.json({
          refs: [{ kind: "file_id", ref: "../assistant/conversations?" }],
        })
      );
      const { result } = renderAllowlistedHook();

      await expect(
        result.current.readFile("../assistant/conversations?")
      ).resolves.toEqual({ fileBlob: null });
      expect(clientFetch).not.toHaveBeenCalledWith(
        expect.stringContaining("assistant")
      );
    });

    it("falls back to the Frame context when the allowlist is unavailable", async () => {
      clientFetch
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(Response.json({ useCaseMetadata: {} }));
      const { result } = renderAllowlistedHook();

      await expect(
        result.current.readFile("fil_abc123def456")
      ).resolves.toEqual({ fileBlob: null });
      expect(clientFetch).toHaveBeenNthCalledWith(1, allowlistUrl);
      expect(clientFetch).toHaveBeenNthCalledWith(
        2,
        "/api/w/w_test/files/fil_abc123def456/metadata"
      );
    });
  });

  describe("file ids", () => {
    const metadataUrl = "/api/w/w_test/files/fil_abc123def456/metadata";
    const contentUrl = "/api/w/w_test/files/fil_abc123def456?action=view";

    const renderScopedHook = () =>
      renderHook(() =>
        useFrameFiles({
          ...options,
          conversationId: "c_test",
          spaceId: "p_test",
        })
      );

    it.each([
      ["conversation", { conversationId: "c_test" }],
      ["Pod", { spaceId: "p_test" }],
    ])("reads a file from the Frame's %s", async (_label, useCaseMetadata) => {
      clientFetch
        .mockResolvedValueOnce(Response.json({ useCaseMetadata }))
        .mockResolvedValueOnce(new Response("{}"));
      const { result } = renderScopedHook();

      await expect(
        result.current.readFile("fil_abc123def456")
      ).resolves.toMatchObject({ fileBlob: expect.any(Blob), canWrite: false });
      expect(clientFetch).toHaveBeenNthCalledWith(1, metadataUrl);
      expect(clientFetch).toHaveBeenNthCalledWith(2, contentUrl);
    });

    it.each([
      ["another conversation", { conversationId: "c_other" }],
      ["another Pod", { spaceId: "p_other" }],
      ["no context", {}],
    ])(
      "never fetches content for a file from %s",
      async (_label, useCaseMetadata) => {
        clientFetch.mockResolvedValueOnce(Response.json({ useCaseMetadata }));
        const { result } = renderScopedHook();

        await expect(
          result.current.readFile("fil_abc123def456")
        ).resolves.toEqual({ fileBlob: null });
        expect(clientFetch).toHaveBeenCalledExactlyOnceWith(metadataUrl);
      }
    );

    it("never fetches content when metadata is unavailable", async () => {
      clientFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
      const { result } = renderScopedHook();

      await expect(
        result.current.readFile("fil_abc123def456")
      ).resolves.toEqual({ fileBlob: null });
      expect(clientFetch).toHaveBeenCalledExactlyOnceWith(metadataUrl);
    });
  });

  it("requires a package root for package-relative reads and writes", async () => {
    const { result } = renderHook(() =>
      useFrameFiles({
        workspaceId: options.workspaceId,
        canWrite: true,
      })
    );

    await expect(result.current.readFile(edit.path)).resolves.toMatchObject({
      fileBlob: null,
    });
    await expect(result.current.writeFile(edit)).resolves.toMatchObject({
      success: false,
      error: { code: "invalid_path" },
    });
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it.each([null, '"123"', 'W/"123"'])(
    "saves with the file revision independently of ETag %s",
    async (etag) => {
      clientFetch.mockResolvedValueOnce(
        new Response("{}", {
          headers: {
            "Content-Type": "application/json",
            [DUST_FILE_REVISION_HEADER]: "123",
            ...(etag && { ETag: etag }),
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
        new Response(null, {
          headers: { [DUST_FILE_REVISION_HEADER]: "124", ETag: 'W/"124"' },
        })
      );
      await expect(result.current.writeFile(edit)).resolves.toEqual({
        success: true,
        revision: "124",
      });
      expect(clientFetch).toHaveBeenLastCalledWith(
        "/api/w/w_test/files/path/conversation-c_test/report/notes.json",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            [DUST_IF_REVISION_MATCH_HEADER]: "123",
          },
          body: edit.content,
        }
      );
    }
  );

  it("encodes package paths and keeps files without revision metadata read-only", async () => {
    clientFetch.mockResolvedValue(new Response("{}"));
    const { result } = renderHook(() => useFrameFiles(options));
    const file = await result.current.readFile("./draft notes.json");
    expect(clientFetch).toHaveBeenCalledWith(
      "/api/w/w_test/files/path/conversation-c_test/report/draft%20notes.json"
    );
    expect(file.canWrite).toBe(false);
  });

  it.each([null, "", 'W/"123"'])(
    "keeps files with missing or invalid revision %s read-only even with an ETag",
    async (revision) => {
      clientFetch.mockResolvedValue(
        new Response("{}", {
          headers: {
            ETag: '"123"',
            [DUST_FILE_CAN_WRITE_HEADER]: "true",
            ...(revision !== null && { [DUST_FILE_REVISION_HEADER]: revision }),
          },
        })
      );
      const { result } = renderHook(() => useFrameFiles(options));
      await expect(result.current.readFile(edit.path)).resolves.toMatchObject({
        fileBlob: expect.any(Blob),
        revision: null,
        canWrite: false,
      });
    }
  );

  it.each([
    "../outside.json",
    "./.\x01./outside.json",
    "conversation-c_test/other/notes.json",
    "conversation-c_test/report/../outside.json",
    "conversation-c_test/report/sub/../../outside.json",
    "pod-p_other/report/notes.json",
    "fil_abc123def456",
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

  it.each(["report.v2", "manifest.json"])(
    "preserves the package directory %s for reads and writes",
    async (folderName) => {
      const { result } = renderHook(() =>
        useFrameFiles({
          ...options,
          packageRoot: `conversation-c_test/${folderName}`,
        })
      );
      clientFetch.mockResolvedValue(
        new Response(null, { headers: { [DUST_FILE_REVISION_HEADER]: "124" } })
      );
      await result.current.readFile(edit.path);
      expect(clientFetch).toHaveBeenCalledWith(
        `/api/w/w_test/files/path/conversation-c_test/${folderName}/notes.json`
      );
      await result.current.writeFile(edit);
      expect(clientFetch).toHaveBeenCalledWith(
        `/api/w/w_test/files/path/conversation-c_test/${folderName}/notes.json`,
        expect.objectContaining({ method: "PUT" })
      );
    }
  );

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

  it.each([false, true])(
    "respects API write permission %s",
    async (canWrite) => {
      clientFetch.mockResolvedValue(
        new Response("{}", {
          headers: {
            [DUST_FILE_REVISION_HEADER]: "123",
            [DUST_FILE_CAN_WRITE_HEADER]: String(canWrite),
          },
        })
      );
      const { result } = renderHook(() => useFrameFiles(options));
      await expect(result.current.readFile(edit.path)).resolves.toMatchObject({
        canWrite,
      });
    }
  );

  it.each([null, "", 'W/"124"'])(
    "does not confirm a save with missing or invalid revision %s",
    async (revision) => {
      clientFetch.mockResolvedValue(
        new Response(null, {
          headers: {
            ETag: '"124"',
            ...(revision !== null && { [DUST_FILE_REVISION_HEADER]: revision }),
          },
        })
      );
      const { result } = renderHook(() => useFrameFiles(options));
      await expect(result.current.writeFile(edit)).resolves.toMatchObject({
        success: false,
        error: { code: "save_failed" },
      });
    }
  );

  it("surfaces permissions revoked by the file API", async () => {
    clientFetch.mockResolvedValue(new Response(null, { status: 403 }));
    const { result } = renderHook(() => useFrameFiles(options));
    await expect(result.current.writeFile(edit)).resolves.toMatchObject({
      success: false,
      error: { code: "read_only" },
    });
  });
});
