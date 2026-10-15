// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { getVizCatalog } from "@viz/app/lib/i18n/catalogs";
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
  vi.unstubAllGlobals();
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
  ])(
    "selects file access for $label",
    async ({ isAuthenticatedMember, isPdfMode }) => {
      const fetchSharedFile = vi.fn(
        async () =>
          new Response("Shared content", {
            headers: { "content-type": "application/json" },
          })
      );
      vi.stubGlobal("fetch", fetchSharedFile);
      render(
        <ServerVisualizationWrapperClient
          accessToken="token"
          identifier="frame"
          allowedOrigins={["https://app.dust.tt"]}
          isAuthenticatedMember={isAuthenticatedMember}
          isPdfMode={isPdfMode}
          catalog={getVizCatalog("en-US")}
          prefetchedCode={'useFile("./content.json")'}
        />
      );
      await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled());
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
        expect(file?.file.type).toBe("application/json");
        expect(fetchSharedFile).toHaveBeenCalledExactlyOnceWith(
          "/api/shared-files?fileRef=.%2Fcontent.json",
          { headers: { Authorization: "Bearer token" }, cache: "no-store" }
        );
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
      await expect(dataAPI.fetchCode()).resolves.toBe(
        'useFile("./content.json")'
      );
    }
  );
});
