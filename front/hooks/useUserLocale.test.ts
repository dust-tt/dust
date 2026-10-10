import { useUserLocale } from "@app/hooks/useUserLocale";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { SupportedLocale } from "@app/types/locale";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  storedUserLocale: null as SupportedLocale | null,
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ userLocale: state.storedUserLocale }),
}));

vi.mock("@app/lib/swr/workspaces", () => ({
  useAuthContext: () => ({ mutateAuthContext: vi.fn() }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

function renderUserLocale(workspaceLocale: SupportedLocale) {
  const owner = LightWorkspaceFactory.build({ locale: workspaceLocale });
  return renderHook(() => useUserLocale({ owner })).result.current.userLocale;
}

describe("useUserLocale", () => {
  beforeEach(() => {
    state.storedUserLocale = null;
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
});
