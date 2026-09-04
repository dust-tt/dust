import { useEditFrameText } from "@app/lib/swr/frames";
import type { LightWorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientFetch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/egress/client", () => ({ clientFetch }));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "workspace_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

beforeEach(() => {
  clientFetch.mockReset();
  clientFetch.mockResolvedValue(new Response(null, { status: 200 }));
});

describe("useEditFrameText", () => {
  it("sends Frame v2 edits to the stable Frame endpoint", async () => {
    const { result } = renderHook(() =>
      useEditFrameText({
        conversationId: "conversation_1",
        fileId: "frame_1",
        owner,
        renderMode: "v2",
      })
    );

    await act(async () => {
      await expect(
        result.current({
          newText: "Done",
          oldText: "Ready",
          source: "index.tsx:1:42",
        })
      ).resolves.toEqual({ success: true });
    });

    expect(clientFetch).toHaveBeenCalledWith(
      "/api/w/workspace_1/frames/frame_1/edit-text",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversationId: "conversation_1",
          newText: "Done",
          oldText: "Ready",
          source: "index.tsx:1:42",
        }),
      })
    );
  });

  it("preserves target-file routing for legacy context edits", async () => {
    const { result } = renderHook(() =>
      useEditFrameText({
        conversationId: "conversation_1",
        fileId: "frame_1",
        owner,
        renderMode: "legacy",
      })
    );

    await act(async () => {
      await result.current({
        newText: "Done",
        oldText: "Ready",
        targetFileId: "nested_1",
      });
    });

    expect(clientFetch).toHaveBeenCalledWith(
      "/api/w/workspace_1/files/nested_1/edit-text",
      expect.objectContaining({ method: "POST" })
    );
  });
});
