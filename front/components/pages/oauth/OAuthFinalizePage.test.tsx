import { OAuthFinalizePage } from "@app/components/pages/oauth/OAuthFinalizePage";
import { Err, Ok } from "@app/types/shared/result";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  doFinalize: vi.fn(),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    isReady: true,
    query: { code: "auth-code", state: "con_1" },
  }),
  usePathParam: (name: string) => (name === "provider" ? "github" : null),
}));

vi.mock("@app/lib/swr/oauth", () => ({
  useFinalize: () => mocks.doFinalize,
}));

vi.mock("@dust-tt/sparkle", () => ({
  Spinner: () => <div role="status" />,
}));

vi.mock("@app/logger/logger", () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe("OAuthFinalizePage postMessage target origin", () => {
  const originalLocation = window.location;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.doFinalize.mockReset();
    postMessage = vi.fn();
    Object.defineProperty(window, "opener", {
      configurable: true,
      value: { closed: false, postMessage },
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        origin: "https://app.dust.tt",
        href: "https://app.dust.tt/oauth/github/finalize",
      },
    });
    vi.spyOn(window, "close").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    Object.defineProperty(window, "opener", {
      configurable: true,
      value: null,
    });
  });

  it("redirects when finalize asks to continue authorize", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        origin: "https://app.dust.tt",
        href: "https://app.dust.tt/oauth/github/finalize",
        assign,
      },
    });
    mocks.doFinalize.mockResolvedValue(
      new Ok({
        type: "continue_authorize",
        authorizeUrl: "https://github.com/login/oauth/authorize?client_id=x",
      })
    );

    render(<OAuthFinalizePage />);

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith(
        "https://github.com/login/oauth/authorize?client_id=x"
      );
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("posts to a legitimate Dust opener origin and omits connection metadata", async () => {
    mocks.doFinalize.mockResolvedValue(
      new Ok({
        type: "finalized",
        connection: {
          connection_id: "con_1",
          created: 1,
          provider: "github",
          status: "finalized",
          metadata: {
            opener_origin: "https://dust.tt",
            workspace_id: "w_1",
            user_id: "user_1",
          },
        },
      })
    );

    render(<OAuthFinalizePage />);

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(1);
    });

    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "connection_finalized",
        provider: "github",
        connection: {
          connection_id: "con_1",
          created: 1,
          provider: "github",
          status: "finalized",
          related_credential_id: undefined,
          metadata: {},
        },
      },
      "https://dust.tt"
    );
  });

  it("does not postMessage to an attacker-controlled opener origin", async () => {
    mocks.doFinalize.mockResolvedValue(
      new Ok({
        type: "finalized",
        connection: {
          connection_id: "con_stolen",
          created: 1,
          provider: "github",
          status: "finalized",
          metadata: {
            opener_origin: "https://attacker.example",
            workspace_id: "w_victim",
          },
        },
      })
    );

    render(<OAuthFinalizePage />);

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(1);
    });

    // Falls back to the finalize page origin (trusted), not the attacker origin.
    // Browser will not deliver to an opener on a different origin.
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "connection_finalized",
        connection: expect.objectContaining({
          connection_id: "con_stolen",
          metadata: {},
        }),
      }),
      "https://app.dust.tt"
    );
    expect(postMessage.mock.calls[0][1]).not.toBe("https://attacker.example");
  });

  it("posts the API error when finalization fails", async () => {
    const apiError = {
      type: "connector_oauth_target_mismatch",
      message: "Authorized account does not match.",
    };
    mocks.doFinalize.mockResolvedValue(new Err(apiError));

    render(<OAuthFinalizePage />);

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(1);
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: "connection_finalized", apiError, provider: "github" },
      "https://app.dust.tt"
    );
  });
});
