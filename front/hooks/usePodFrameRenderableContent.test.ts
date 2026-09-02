import { usePodFrameRenderableContent } from "@app/hooks/usePodFrameRenderableContent";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Mocks {
  fileContentType: string | null;
}

const mocks = vi.hoisted<Mocks>(() => ({
  fileContentType: "application/vnd.dust.frame.v2+json",
}));

vi.mock("@app/lib/swr/files", () => ({
  useFileContent: () => ({
    error: null,
    fileContent: "frame bundle",
    isFileContentLoading: false,
  }),
  useFileIdFromPath: () => ({
    fileContentType: mocks.fileContentType,
    fileId: "fil_frame",
    fileIdError: null,
    isFileIdLoading: false,
    isFileIdNotFound: false,
  }),
}));

const owner = LightWorkspaceFactory.build();

afterEach(() => {
  mocks.fileContentType = frameV2ContentType;
});

describe("usePodFrameRenderableContent", () => {
  it.each([
    [frameV2ContentType, "v2"],
    [frameContentType, "legacy"],
    ["text/plain", null],
  ])("classifies %s from the linked FileResource header", (contentType, kind) => {
    mocks.fileContentType = contentType;

    const { result } = renderHook(() =>
      usePodFrameRenderableContent({
        owner,
        framePath: "pod-vlt_project/App/App.tsx",
      })
    );

    expect(result.current.functionReferenceKind).toBe(kind);
  });
});
