import {
  AuthenticatedVisualizationActionIframe,
  getAuthenticatedFrameUserIdentity,
} from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import type { VisualizationActionIframeProps } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { i18n } from "@app/lib/i18n/i18n";
import { VisualizationFactory } from "@app/tests/utils/VisualizationFactory";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderIframe: vi.fn<(props: VisualizationActionIframeProps) => void>(),
}));

vi.mock(
  "@app/components/assistant/conversation/actions/VisualizationActionIframe",
  () => ({
    VisualizationActionIframe: (props: VisualizationActionIframeProps) => {
      mocks.renderIframe(props);
      return null;
    },
  })
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const authContext = {
  workspace: { role: "user" as const, sId: "w_current" },
  user: {
    sId: "usr_123",
    firstName: "Ada",
    lastName: "Lovelace",
    fullName: "Ada Lovelace",
    image: null,
  },
};

describe("getAuthenticatedFrameUserIdentity", () => {
  it("scopes the authenticated user to the Frame workspace", () => {
    expect(getAuthenticatedFrameUserIdentity(authContext, "w_current")).toEqual(
      {
        workspaceId: "w_current",
        isPodEditor: false,
        isPodMember: false,
        user: authContext.user,
      }
    );
  });

  it("forwards the pod editorship flag when the host knows it", () => {
    expect(
      getAuthenticatedFrameUserIdentity(authContext, "w_current", true)
    ).toEqual({
      workspaceId: "w_current",
      isPodEditor: true,
      isPodMember: false,
      user: authContext.user,
    });
  });

  it("forwards the pod membership flag when the host knows it", () => {
    expect(
      getAuthenticatedFrameUserIdentity(authContext, "w_current", false, true)
    ).toEqual({
      workspaceId: "w_current",
      isPodEditor: false,
      isPodMember: true,
      user: authContext.user,
    });
  });

  it("returns no identity for an auth context from another workspace", () => {
    expect(
      getAuthenticatedFrameUserIdentity(authContext, "w_other")
    ).toBeUndefined();
  });

  it("returns no identity for a non-member auth context", () => {
    expect(
      getAuthenticatedFrameUserIdentity(
        {
          ...authContext,
          workspace: { ...authContext.workspace, role: "none" },
        },
        "w_current"
      )
    ).toBeUndefined();
  });
});

describe("AuthenticatedVisualizationActionIframe", () => {
  function renderedLocale(activeLocale: string) {
    i18n.loadAndActivate({ locale: activeLocale, messages: {} });
    render(
      createElement(AuthenticatedVisualizationActionIframe, {
        agentConfigurationId: null,
        conversationId: null,
        visualization: VisualizationFactory.buildProtected(),
        vizUrl: "https://viz.dust.tt",
        workspaceId: "w_current",
      })
    );
    return mocks.renderIframe.mock.lastCall?.[0].locale;
  }

  it("passes front's active locale to the Frame", () => {
    expect(renderedLocale("fr-FR")).toBe("fr-FR");
    expect(renderedLocale("en-GB")).toBe("en-GB");
  });

  it("falls back to the default locale for the pseudo-locale", () => {
    expect(renderedLocale("pseudo")).toBe("en-US");
  });

  it("targets no publication by default, so functions run live", () => {
    renderedLocale("en-US");
    expect(
      mocks.renderIframe.mock.lastCall?.[0].functionTarget
    ).toBeUndefined();
  });

  it("passes the host's function target through", () => {
    render(
      createElement(AuthenticatedVisualizationActionIframe, {
        agentConfigurationId: null,
        conversationId: null,
        functionTarget: "latest",
        visualization: VisualizationFactory.buildProtected(),
        vizUrl: "https://viz.dust.tt",
        workspaceId: "w_current",
      })
    );
    expect(mocks.renderIframe.mock.lastCall?.[0].functionTarget).toBe("latest");
  });
});
