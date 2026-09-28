// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { VisualizationConfig } from "@viz/app/lib/visualization-api";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServerVisualizationWrapperClient } from "./ServerVisualizationWrapperClient";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  render: vi.fn<(config: VisualizationConfig) => void>(),
}));

vi.mock("@viz/app/components/VisualizationWrapper", () => ({
  makeSendCrossDocumentMessage: () => mocks.sendMessage,
  VisualizationWrapperWithErrorBoundary: ({
    config,
  }: {
    config: VisualizationConfig;
  }) => {
    mocks.render(config);
    return null;
  },
}));

vi.mock("@viz/app/components/NavigationProvider", () => ({
  NavigationProvider: ({ children }: { children: ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("shared-view file access", () => {
  it.each([
    {
      label: "anonymous viewer",
      isAuthenticatedMember: false,
      isPdfMode: false,
    },
    {
      label: "member PDF export",
      isAuthenticatedMember: true,
      isPdfMode: true,
    },
    {
      label: "workspace member",
      isAuthenticatedMember: true,
      isPdfMode: false,
    },
  ])("selects file access for $label", async ({
    isAuthenticatedMember,
    isPdfMode,
  }) => {
    render(
      <ServerVisualizationWrapperClient
        identifier="frame"
        allowedOrigins={["https://app.dust.tt"]}
        isAuthenticatedMember={isAuthenticatedMember}
        isPdfMode={isPdfMode}
        prefetchedCode="Published code"
        prefetchedFiles={[
          {
            fileId: "./content.json",
            data: btoa("Cached content"),
            mimeType: "application/json",
          },
        ]}
      />
    );
    const { dataAPI } = mocks.render.mock.calls[0][0];
    mocks.sendMessage.mockResolvedValueOnce({
      fileBlob: new Blob(["Live content"]),
      revision: "123",
      canWrite: true,
    });
    const file = await dataAPI.fetchFile("./content.json");
    if (isAuthenticatedMember && !isPdfMode) {
      expect(file).toMatchObject({ revision: "123", canWrite: true });
      expect(mocks.sendMessage).toHaveBeenCalledExactlyOnceWith("getFile", {
        fileId: "./content.json",
      });
    } else {
      expect(file).toMatchObject({ revision: null, canWrite: false });
      await expect(
        dataAPI.writeFile({
          path: "./content.json",
          content: "{}",
          revision: "123",
        })
      ).resolves.toMatchObject({
        success: false,
        error: { code: "read_only" },
      });
      await expect(dataAPI.getUserIdentity()).resolves.toMatchObject({
        isAuthenticated: false,
      });
      expect(mocks.sendMessage).not.toHaveBeenCalled();
    }
    await expect(dataAPI.fetchCode()).resolves.toBe("Published code");
  });
});
