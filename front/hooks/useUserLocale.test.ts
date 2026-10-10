import { useUserLocale } from "@app/hooks/useUserLocale";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { SupportedLocale } from "@app/types/locale";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  storedUserLocale: null as SupportedLocale | null,
  clientFetch: vi.fn(),
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ userLocale: state.storedUserLocale }),
}));

vi.mock("@app/lib/swr/workspaces", () => ({
  useAuthContext: () => ({ mutateAuthContext: vi.fn() }),
}));

vi.mock("@app/lib/egress/client", () => ({
  clientFetch: state.clientFetch,
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

function renderUseUserLocale(workspaceLocale: SupportedLocale) {
  const owner = LightWorkspaceFactory.build({ locale: workspaceLocale });
  return renderHook(() => useUserLocale({ owner })).result.current;
}

function renderUserLocale(workspaceLocale: SupportedLocale) {
  return renderUseUserLocale(workspaceLocale).userLocale;
}

describe("useUserLocale", () => {
  beforeEach(() => {
    state.storedUserLocale = null;
    state.clientFetch.mockReset();
    state.clientFetch.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the locale the user chose over the browser's", () => {
    state.storedUserLocale = "en-GB";
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);

    expect(renderUserLocale("fr-FR")).toBe("en-GB");
  });

  it("returns the browser locale over the workspace's", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "fr-CA"]);

    expect(renderUserLocale("en-US")).toBe("fr-FR");
  });

  it("returns the workspace locale when no browser language is supported", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);

    expect(renderUserLocale("fr-FR")).toBe("fr-FR");
  });

  it("returns the browser as the automatic locale source when it has a match", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-CA"]);

    expect(renderUseUserLocale("en-US")).toMatchObject({
      automaticLocale: "fr-FR",
      automaticLocaleSource: "browser",
    });
  });

  it("returns the workspace as the automatic locale source otherwise", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);

    expect(renderUseUserLocale("fr-FR")).toMatchObject({
      automaticLocale: "fr-FR",
      automaticLocaleSource: "workspace",
    });
  });

  it("deletes the stored locale when updated to null", async () => {
    state.storedUserLocale = "fr-FR";

    const { doUpdateUserLocale } = renderUseUserLocale("en-US");

    await act(() => doUpdateUserLocale(null));

    expect(state.clientFetch).toHaveBeenCalledWith(
      "/api/user/metadata/locale",
      {
        method: "DELETE",
      }
    );
  });

  it("stores the locale when updated to a locale", async () => {
    const { doUpdateUserLocale } = renderUseUserLocale("en-US");

    await act(() => doUpdateUserLocale("en-GB"));

    expect(state.clientFetch).toHaveBeenCalledWith(
      "/api/user/metadata/locale",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ value: "en-GB" }),
      })
    );
  });
});
