import {
  getPublicFrameUserIdentity,
  PublicFrameRenderer,
} from "@app/components/assistant/conversation/interactive_content/PublicFrameRenderer";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isUserLoading: true,
}));

vi.mock(
  "@app/components/assistant/conversation/actions/VisualizationActionIframe",
  () => ({
    VisualizationActionIframe: () => "frame-iframe",
  })
);

vi.mock("@app/lib/cookies", () => ({
  DUST_HAS_SESSION: "dust-session",
  hasSessionIndicator: () => true,
}));

vi.mock("@app/lib/swr/frames", () => ({
  usePublicFrame: () => ({
    conversationUrl: null,
    projectUrl: null,
    isFrameLoading: false,
    error: null,
    accessToken: "token",
    isAuthenticatedMember: true,
  }),
}));

vi.mock("@app/lib/swr/user", () => ({
  useUser: () => ({
    user: null,
    isUserLoading: mocks.isUserLoading,
  }),
}));

vi.mock("react-cookie", () => ({
  useCookies: () => [{ "dust-session": "1" }],
}));

const user = {
  sId: "usr_123",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  image: null,
  workspaces: [{ sId: "w_current" }],
};

afterEach(() => {
  cleanup();
  mocks.isUserLoading = true;
});

describe("getPublicFrameUserIdentity", () => {
  it("scopes a server-confirmed member to the Frame workspace", () => {
    expect(getPublicFrameUserIdentity(user, true, "w_current")).toEqual({
      workspaceId: "w_current",
      user: {
        sId: "usr_123",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        image: null,
      },
    });
  });

  it("rejects a user who belongs only to another workspace", () => {
    expect(getPublicFrameUserIdentity(user, true, "w_other")).toBeUndefined();
  });

  it("rejects a viewer not confirmed as a workspace member", () => {
    expect(
      getPublicFrameUserIdentity(user, false, "w_current")
    ).toBeUndefined();
  });
});

describe("PublicFrameRenderer", () => {
  it("waits for the member identity request before mounting the Frame", () => {
    const props = {
      fileId: "file_123",
      hideHeader: true,
      shareToken: "share-token",
      workspaceId: "w_current",
      vizUrl: "https://viz.dust.tt",
    };
    const { rerender } = render(createElement(PublicFrameRenderer, props));

    expect(screen.queryByText("frame-iframe")).toBeNull();

    mocks.isUserLoading = false;
    rerender(createElement(PublicFrameRenderer, props));

    expect(screen.getByText("frame-iframe")).not.toBeNull();
  });
});
