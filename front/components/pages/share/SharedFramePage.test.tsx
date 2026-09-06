import { SharedFramePage } from "@app/components/pages/share/SharedFramePage";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  frameError: null as unknown,
  hasSession: false,
  isUserError: null as unknown,
  isUserLoading: false,
  requiresEmailVerification: false,
  user: null as { sId: string } | null,
}));

vi.mock(
  "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentContainer",
  () => ({
    PublicInteractiveContentContainer: () => <div>frame content</div>,
  })
);

vi.mock("@app/components/pages/Custom404", () => ({
  default: () => <div>404</div>,
}));

vi.mock("@app/components/pages/CustomErrorPage", () => ({
  default: ({
    title,
    description,
    href,
    label,
  }: {
    title: string;
    description: string;
    href: string;
    label: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      <a href={href}>{label}</a>
    </div>
  ),
}));

vi.mock("@app/components/pages/share/EmailVerificationFlow", () => ({
  EmailVerificationFlow: () => <div>email verification</div>,
}));

vi.mock("@app/hooks/useDocumentTitle", () => ({
  useDocumentTitle: () => undefined,
}));

vi.mock("@app/lib/api/config", () => ({
  default: {
    getApiBaseUrl: () => "https://dust.tt",
  },
}));

vi.mock("@app/lib/cookies", () => ({
  DUST_HAS_SESSION: "dust-has-session",
  hasSessionIndicator: () => mocks.hasSession,
}));

vi.mock("@app/lib/platform", () => ({
  usePathParam: () => "share-token",
}));

vi.mock("@app/lib/swr/frames", () => ({
  usePublicFrame: () => ({
    error: mocks.frameError,
    frameMetadata: null,
    mutateFrame: vi.fn(),
  }),
}));

vi.mock("@app/lib/swr/share", () => ({
  useShareFrameMetadata: () => ({
    isShareMetadataLoading: false,
    shareMetadata: {
      faviconUrl: null,
      logoUrl: null,
      ogImageUrl: null,
      requiresEmailVerification: mocks.requiresEmailVerification,
      shareUrl: "https://dust.tt/share/frame/share-token",
      showSignUpCta: false,
      title: "Quarterly review",
      vizUrl: "https://viz.dust.tt",
      workspaceId: "w_123",
      workspaceName: "Acme",
    },
    shareMetadataError: null,
  }),
}));

vi.mock("@app/lib/swr/user", () => ({
  useUser: () => ({
    isUserError: mocks.isUserError,
    isUserLoading: mocks.isUserLoading,
    user: mocks.user,
  }),
}));

vi.mock("@app/lib/utils", () => ({
  getFaviconPath: () => "/favicon.png",
}));

vi.mock("@dust-tt/sparkle", () => ({
  LogIn01: () => null,
  Spinner: () => <div>loading</div>,
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock("react-cookie", () => ({
  useCookies: () => [{}],
}));

afterEach(() => {
  cleanup();
  mocks.frameError = null;
  mocks.hasSession = false;
  mocks.isUserError = null;
  mocks.isUserLoading = false;
  mocks.requiresEmailVerification = false;
  mocks.user = null;
  window.history.replaceState({}, "", "/");
});

describe("SharedFramePage", () => {
  it("prompts a logged-out viewer to sign in and preserves the Frame URL", () => {
    mocks.frameError = new Error("not found");
    window.history.replaceState(
      {},
      "",
      "/share/frame/share-token?source=email#section"
    );

    render(<SharedFramePage />);

    expect(screen.getByText("Sign in to open this Frame")).toBeDefined();
    expect(
      screen.getByText(
        "Sign in with an account that has access. We’ll bring you back here."
      )
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "https://dust.tt/api/workos/login?returnTo=%2Fshare%2Fframe%2Fshare-token%3Fsource%3Demail%23section"
    );
    expect(screen.queryByText("frame content")).toBeNull();
  });

  it("keeps the non-enumerating 404 for a signed-in viewer without access", () => {
    mocks.frameError = new Error("not found");
    mocks.hasSession = true;
    mocks.user = { sId: "usr_123" };

    render(<SharedFramePage />);

    expect(screen.getByText("404")).toBeDefined();
    expect(screen.queryByText("Sign in to open this Frame")).toBeNull();
  });

  it("treats a stale session indicator as logged out", () => {
    mocks.frameError = new Error("not found");
    mocks.hasSession = true;
    mocks.isUserError = new Error("not authenticated");

    render(<SharedFramePage />);

    expect(screen.getByText("Sign in to open this Frame")).toBeDefined();
  });

  it("preserves the email verification flow for invited viewers", () => {
    mocks.frameError = new Error("not found");
    mocks.requiresEmailVerification = true;

    render(<SharedFramePage />);

    expect(screen.getByText("email verification")).toBeDefined();
    expect(screen.queryByText("Sign in to open this Frame")).toBeNull();
  });

  it("renders a public Frame without asking the viewer to sign in", () => {
    render(<SharedFramePage />);

    expect(screen.getByText("frame content")).toBeDefined();
    expect(screen.queryByText("Sign in to open this Frame")).toBeNull();
  });
});
