import { JoinPage } from "@app/components/pages/onboarding/JoinPage";
import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { setLocaleOverride } from "@app/lib/i18n/locale_override";
import type { GetJoinResponseBody } from "@app/lib/signup";
import { DEFAULT_LOCALE } from "@app/types/locale";
import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  joinData: null as GetJoinResponseBody | null,
  joinDataError: null as Error | null,
  isJoinDataLoading: true,
}));

vi.mock("@app/lib/platform", () => ({
  useRequiredPathParam: () => "w_test",
  useSearchParam: () => null,
}));

vi.mock("@app/lib/swr/workspaces", () => ({
  useJoinData: () => ({
    joinData: state.joinData,
    joinDataError: state.joinDataError,
    isJoinDataLoading: state.isJoinDataLoading,
    redirectUrl: null,
    mutateJoinData: vi.fn(),
  }),
}));

function buildJoinData(): GetJoinResponseBody {
  return {
    onboardingType: "email_invite",
    workspace: { sId: "w_test", name: "Acme", locale: "fr-FR" },
    signInUrl: "https://example.com/sign-in",
    userExists: false,
  };
}

describe("JoinPage", () => {
  beforeAll(async () => {
    await loadCatalog("fr-FR");
    await loadCatalog(DEFAULT_LOCALE);
  });

  beforeEach(() => {
    setLocaleOverride(null);
    setFormatLocale(undefined);
    state.joinData = null;
    state.joinDataError = null;
    state.isJoinDataLoading = true;
  });

  it("shows the invitation only once the workspace locale is active", async () => {
    state.joinData = buildJoinData();
    state.isJoinDataLoading = false;

    render(<JoinPage />);

    expect(screen.queryByText("Welcome aboard!")).toBeNull();
    expect(await screen.findByText("Bienvenue à bord !")).toBeDefined();
  });

  it("shows the error in the default locale", async () => {
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });
    state.joinDataError = new Error("Network error");
    state.isJoinDataLoading = false;

    render(<JoinPage />);

    expect(await screen.findByText("Something went wrong")).toBeDefined();
    expect(i18n.locale).toBe(DEFAULT_LOCALE);
  });
});
