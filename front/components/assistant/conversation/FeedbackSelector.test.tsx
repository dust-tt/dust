import { FeedbackSelector } from "@app/components/assistant/conversation/FeedbackSelector";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/components/assistant/conversation/FeedbackSelectorPopoverContent",
  () => ({
    FeedbackSelectorPopoverContent: () => null,
  })
);

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const defaultProps: ComponentProps<typeof FeedbackSelector> = {
  feedback: null,
  onSubmitThumb: vi.fn().mockResolvedValue(undefined),
  isSubmittingThumb: false,
  owner,
  agentConfigurationId: "agent_1",
  agentName: "Helper",
  isGlobalAgent: false,
};

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("FeedbackSelector", () => {
  it("opens the feedback dialog with thumbs up preselected", async () => {
    const user = userEvent.setup();
    const onSubmitThumb = vi.fn().mockResolvedValue(undefined);
    render(
      <FeedbackSelector {...defaultProps} onSubmitThumb={onSubmitThumb} />
    );

    await user.click(
      screen.getByRole("button", { name: "I found this helpful" })
    );

    expect(
      screen.getByRole("heading", { name: "Provide feedback on Helper" })
    ).toBeInTheDocument();
    expect(screen.getByText("Glad you liked it! Tell us more?")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onSubmitThumb).toHaveBeenCalledWith({
        thumb: "up",
        shouldRemoveExistingFeedback: false,
        feedbackContent: null,
        isConversationShared: true,
      });
    });
  });

  it("opens the feedback dialog with thumbs down preselected", async () => {
    const user = userEvent.setup();
    const onSubmitThumb = vi.fn().mockResolvedValue(undefined);
    render(
      <FeedbackSelector {...defaultProps} onSubmitThumb={onSubmitThumb} />
    );

    await user.click(
      screen.getByRole("button", {
        name: "Report an issue with this answer",
      })
    );

    expect(screen.getByText("What was the issue?")).toBeVisible();
    await user.type(
      screen.getByPlaceholderText("Describe what went wrong"),
      "The answer used outdated data."
    );
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(onSubmitThumb).toHaveBeenCalledWith({
        thumb: "down",
        shouldRemoveExistingFeedback: false,
        feedbackContent: "The answer used outdated data.",
        isConversationShared: true,
      });
    });
  });

  it("removes feedback when clicking the selected thumb", async () => {
    const user = userEvent.setup();
    const onSubmitThumb = vi.fn().mockResolvedValue(undefined);
    render(
      <FeedbackSelector
        {...defaultProps}
        feedback={{
          thumb: "up",
          feedbackContent: null,
          isConversationShared: true,
        }}
        onSubmitThumb={onSubmitThumb}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "I found this helpful" })
    );

    expect(onSubmitThumb).toHaveBeenCalledWith({
      thumb: "up",
      shouldRemoveExistingFeedback: true,
      feedbackContent: null,
      isConversationShared: false,
    });
    expect(
      screen.queryByRole("heading", { name: "Provide feedback on Helper" })
    ).not.toBeInTheDocument();
  });
});
