import {
  getPublicFrameUserIdentity,
  PublicFrameRenderer,
} from "@app/components/assistant/conversation/interactive_content/PublicFrameRenderer";
import type { ScopedWorkspaceUserIdentity } from "@app/types/assistant/visualization";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  iframeProps: null as {
    canInvokeFunctions: boolean;
    frameId?: string;
    scopedUserIdentity?: ScopedWorkspaceUserIdentity;
    viewer: unknown;
  } | null,
  isAuthenticatedMember: true,
  isPodEditor: false,
  isPodMember: false,
  isUserLoading: true,
  user: null as typeof user | null,
}));

vi.mock(
  "@app/components/assistant/conversation/actions/VisualizationActionIframe",
  () => ({
    VisualizationActionIframe: (props: {
      canInvokeFunctions: boolean;
      frameId?: string;
      scopedUserIdentity?: ScopedWorkspaceUserIdentity;
      viewer: unknown;
    }) => {
      mocks.iframeProps = props;
      return "frame-iframe";
    },
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
    isAuthenticatedMember: mocks.isAuthenticatedMember,
    isPodMember: mocks.isPodMember,
    isPodEditor: mocks.isPodEditor,
  }),
}));

vi.mock("@app/lib/swr/user", () => ({
  useUser: () => ({
    user: mocks.user,
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
  mocks.iframeProps = null;
  mocks.isAuthenticatedMember = true;
  mocks.isPodEditor = false;
  mocks.isPodMember = false;
  mocks.isUserLoading = true;
  mocks.user = null;
});

describe("getPublicFrameUserIdentity", () => {
  it("scopes a server-confirmed member to the Frame workspace", () => {
    expect(getPublicFrameUserIdentity(user, true, "w_current")).toEqual({
      workspaceId: "w_current",
      isPodMember: false,
      isPodEditor: false,
      user: {
        sId: "usr_123",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        image: null,
      },
    });
  });

  it("forwards the viewer's pod standing", () => {
    expect(
      getPublicFrameUserIdentity(user, true, "w_current", true, true)
    ).toMatchObject({
      isPodMember: true,
      isPodEditor: true,
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
      title: "Frame",
      workspaceId: "w_current",
      vizUrl: "https://viz.dust.tt",
    };
    const { rerender } = render(createElement(PublicFrameRenderer, props));

    expect(screen.queryByText("frame-iframe")).toBeNull();

    mocks.isUserLoading = false;
    rerender(createElement(PublicFrameRenderer, props));

    expect(screen.getByText("frame-iframe")).not.toBeNull();
  });

  it("enables function calls with the matching member identity", () => {
    mocks.isUserLoading = false;
    mocks.user = user;
    mocks.isPodMember = true;

    render(
      createElement(PublicFrameRenderer, {
        fileId: "fil_frame",
        frameId: "fil_frame",
        hideHeader: true,
        shareToken: "share-token",
        title: "Frame",
        workspaceId: "w_current",
        vizUrl: "https://viz.dust.tt",
      })
    );

    expect(mocks.iframeProps).toMatchObject({
      canInvokeFunctions: true,
      frameId: "fil_frame",
      scopedUserIdentity: {
        workspaceId: "w_current",
        isPodMember: true,
        isPodEditor: false,
        user: expect.objectContaining({ sId: "usr_123" }),
      },
      // Blocked-action cards run without an AuthProvider on a shared frame, so they get the
      // viewer's workspace and user from here.
      viewer: {
        owner: { sId: "w_current" },
        user: expect.objectContaining({ sId: "usr_123" }),
      },
    });
  });

  it("disables function calls without a member identity", () => {
    mocks.isAuthenticatedMember = false;
    mocks.isUserLoading = false;

    render(
      createElement(PublicFrameRenderer, {
        fileId: "file_123",
        hideHeader: true,
        shareToken: "share-token",
        title: "Frame",
        workspaceId: "w_current",
        vizUrl: "https://viz.dust.tt",
      })
    );

    expect(mocks.iframeProps).toMatchObject({
      canInvokeFunctions: false,
      scopedUserIdentity: undefined,
      viewer: null,
    });
  });
});
