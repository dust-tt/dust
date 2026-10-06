import { CommentAuthorAvatar } from "@app/components/file_explorer/CommentAuthorAvatar";
import {
  useMemberDetails,
  useUnifiedAgentConfigurations,
} from "@app/lib/swr/assistants";
import type { LightWorkspaceType } from "@app/types/user";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/swr/assistants", () => ({
  useMemberDetails: vi.fn(),
  useUnifiedAgentConfigurations: vi.fn(),
}));

const owner = { sId: "w_1" } as LightWorkspaceType;
const USER = { kind: "user", id: "usr_daph", name: "Daph" } as const;
const AGENT = { kind: "agent", id: "dust", name: "@dust" } as const;

const avatar = (container: HTMLElement) => {
  const element = container.firstElementChild;
  if (!element) {
    throw new Error("No avatar rendered.");
  }
  return element;
};

describe("CommentAuthorAvatar", () => {
  beforeEach(() => {
    vi.mocked(useMemberDetails).mockReturnValue({
      userDetails: undefined,
      isMembersLoading: false,
    } as unknown as ReturnType<typeof useMemberDetails>);
    vi.mocked(useUnifiedAgentConfigurations).mockReturnValue({
      agentConfigurations: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useUnifiedAgentConfigurations>);
  });

  it("shows a user as busy while their picture loads", () => {
    vi.mocked(useMemberDetails).mockReturnValue({
      userDetails: undefined,
      isMembersLoading: true,
    } as unknown as ReturnType<typeof useMemberDetails>);

    const { container } = render(
      <CommentAuthorAvatar owner={owner} author={USER} size="xxs" />
    );

    expect(avatar(container).className).toContain("animate-breathing");
  });

  it("shows a user's profile picture", () => {
    vi.mocked(useMemberDetails).mockReturnValue({
      userDetails: { image: "https://example.com/daph.png" },
      isMembersLoading: false,
    } as unknown as ReturnType<typeof useMemberDetails>);

    const { container } = render(
      <CommentAuthorAvatar owner={owner} author={USER} size="xxs" />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/daph.png"
    );
  });

  it("shows the picture of an agent the viewer can list", () => {
    vi.mocked(useUnifiedAgentConfigurations).mockReturnValue({
      agentConfigurations: [
        { sId: "dust", pictureUrl: "https://example.com/dust.png" },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useUnifiedAgentConfigurations>);

    const { container } = render(
      <CommentAuthorAvatar owner={owner} author={AGENT} size="xxs" />
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/dust.png"
    );
  });

  it("falls back to initials for an agent the viewer cannot list", () => {
    const { container } = render(
      <CommentAuthorAvatar owner={owner} author={AGENT} size="xxs" />
    );

    expect(container.querySelector("img")).toBeNull();
    expect(avatar(container).className).not.toContain("animate-breathing");
  });
});
