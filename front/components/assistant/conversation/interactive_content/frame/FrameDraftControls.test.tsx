import { FrameDraftControls } from "@app/components/assistant/conversation/interactive_content/frame/FrameDraftControls";
import { formatDateTime } from "@app/lib/i18n/format";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  makeDraftLive: vi.fn(async (_draftPublicationId: string) => true),
}));

vi.mock("@app/lib/swr/frames", () => ({
  useMakeFrameDraftLive: () => mocks.makeDraftLive,
}));

const owner = { sId: "workspace-sid" } as LightWorkspaceType;

describe("FrameDraftControls", () => {
  beforeEach(() => {
    mocks.makeDraftLive.mockClear();
  });

  it("makes the shown draft live, then refreshes the panel", async () => {
    const user = userEvent.setup();
    const onMadeLive = vi.fn(async () => undefined);
    render(
      <FrameDraftControls
        owner={owner}
        frameId="frame-sid"
        draftPublicationId="publication-draft"
        livePublishedAt={null}
        hideLabels={false}
        onMadeLive={onMadeLive}
      />
    );

    await user.click(screen.getByRole("button", { name: "Make live" }));

    await waitFor(() => expect(onMadeLive).toHaveBeenCalledTimes(1));
    expect(mocks.makeDraftLive).toHaveBeenCalledWith("publication-draft");
  });

  it("still refreshes the panel when making live fails (a newer draft replaced it)", async () => {
    const user = userEvent.setup();
    mocks.makeDraftLive.mockResolvedValueOnce(false);
    const onMadeLive = vi.fn(async () => undefined);
    render(
      <FrameDraftControls
        owner={owner}
        frameId="frame-sid"
        draftPublicationId="publication-draft"
        livePublishedAt={null}
        hideLabels={false}
        onMadeLive={onMadeLive}
      />
    );

    await user.click(screen.getByRole("button", { name: "Make live" }));

    await waitFor(() => expect(onMadeLive).toHaveBeenCalledTimes(1));
    expect(mocks.makeDraftLive).toHaveBeenCalledWith("publication-draft");
    expect(screen.getByRole("button", { name: "Make live" })).toBeEnabled();
  });

  it("explains which version the share link shows when a version is live", async () => {
    const user = userEvent.setup();
    const livePublishedAt = Date.UTC(2026, 9, 1);
    render(
      <FrameDraftControls
        owner={owner}
        frameId="frame-sid"
        draftPublicationId="publication-draft"
        livePublishedAt={livePublishedAt}
        hideLabels
        onMadeLive={async () => undefined}
      />
    );

    await user.hover(screen.getByText("Draft"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      `Not live yet. The share link shows the version from ${formatDateTime(livePublishedAt)}.`
    );
  });

  it("falls back to a generic explanation when nothing is live yet", async () => {
    const user = userEvent.setup();
    render(
      <FrameDraftControls
        owner={owner}
        frameId="frame-sid"
        draftPublicationId="publication-draft"
        livePublishedAt={null}
        hideLabels
        onMadeLive={async () => undefined}
      />
    );

    await user.hover(screen.getByText("Draft"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(
      "Not live yet. The share link shows the live version."
    );
  });

  it("shows the Draft chip, with a tooltip trigger, when a version is live", () => {
    render(
      <FrameDraftControls
        owner={owner}
        frameId="frame-sid"
        draftPublicationId="publication-draft"
        livePublishedAt={Date.UTC(2026, 9, 1)}
        hideLabels
        onMadeLive={async () => undefined}
      />
    );

    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(
      screen.getByText("Draft").closest("span.inline-flex")
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Make live" })
    ).toBeInTheDocument();
  });
});
