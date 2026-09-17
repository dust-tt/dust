/** @jsxRuntime automatic */
import { ArrowUp, Button, Composer, Plus, Robot } from "@dust-tt/sparkle";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn } from "storybook/test";
import { LiveConversationButton } from "../components/assistant/conversation/LiveConversationButton";
import { LiveConversationPanel } from "../components/assistant/conversation/LiveConversationPanel";

const meta = {
  title: "Dust/Live voice",
  component: LiveConversationPanel,
  args: {
    agentName: "Dust",
    status: "idle",
    muted: false,
    seconds: 42,
    transcript: [],
    error: null,
    taskStatus: null,
    onStop: fn(),
    onToggleMute: fn(),
  },
  render: function Render(args) {
    const [started, setStarted] = useState(false);
    const [ended, setEnded] = useState(false);
    const [muted, setMuted] = useState(args.muted);
    const active = !ended && (started || args.status !== "idle");
    return (
      <div className="flex min-h-[440px] w-full items-end bg-background p-4 sm:p-8">
        <div className="mx-auto w-full max-w-[680px]">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-semibold text-foreground">
              What can we get done?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Write a message, or talk it through with Dust.
            </p>
          </div>
          {active && (
            <LiveConversationPanel
              {...args}
              status={started ? "connected" : args.status}
              muted={muted}
              onToggleMute={() => {
                args.onToggleMute();
                setMuted(!muted);
              }}
              onStop={() => {
                args.onStop();
                setEnded(true);
              }}
            />
          )}
          <Composer
            variant="floating"
            isFocused={false}
            leftActions={
              <>
                <Button
                  variant="ghost-secondary"
                  size="xs"
                  icon={Robot}
                  label="Dust"
                  isRounded
                />
                <Button
                  variant="ghost-secondary"
                  size="xs"
                  icon={Plus}
                  aria-label="Add capabilities"
                  isRounded
                />
              </>
            }
            rightActions={
              <>
                <LiveConversationButton
                  size="xs"
                  active={active}
                  onClick={() => {
                    setStarted(true);
                    setEnded(false);
                  }}
                />
                <Button
                  variant="highlight"
                  size="xs"
                  aria-label="Send message"
                  icon={ArrowUp}
                  isRounded
                  disabled
                />
              </>
            }
          >
            <p className="pb-2 text-base text-muted-foreground">
              Ask a question or share a task…
            </p>
          </Composer>
        </div>
      </div>
    );
  },
} satisfies Meta<typeof LiveConversationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The composer is the entry point; call controls appear only after starting. */
export const Ready: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("region", { name: "Live voice" })
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Start voice" }));
    await expect(
      canvas.getByRole("region", { name: "Live voice" })
    ).toHaveTextContent("Voice with @Dust");
    await userEvent.click(canvas.getByRole("button", { name: "Mute" }));
    await expect(canvas.getByText("Microphone muted")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "End call" }));
    await expect(
      canvas.queryByRole("region", { name: "Live voice" })
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Start voice" })
    ).toBeEnabled();
  },
};

export const Connecting: Story = {
  args: { status: "connecting", seconds: 0 },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel voice" }));
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};

export const Listening: Story = {
  args: {
    status: "connected",
    transcript: [
      {
        id: "1",
        speaker: "assistant",
        text: "I can help with that. What would you like to know?",
        startMs: 0,
        endMs: 1000,
      },
    ],
  },
};

export const ApprovalNeeded: Story = {
  args: {
    status: "connected",
    taskStatus: "Your input is needed in chat",
    transcript: [
      {
        id: "1",
        speaker: "assistant",
        text: "Please review the approval in the chat.",
        startMs: 0,
        endMs: 1000,
      },
    ],
  },
};

export const MicrophoneDenied: Story = {
  args: {
    status: "error",
    error:
      "Microphone access was denied. Allow microphone access in your browser and try again.",
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss voice error" })
    );
    await expect(
      canvas.getByRole("button", { name: "Start voice" })
    ).toBeEnabled();
  },
};

export const Compact: Story = {
  render: () => (
    <div className="flex w-80 items-center justify-between rounded-3xl border border-border bg-background px-4 py-2">
      <span className="text-sm text-muted-foreground">
        Reply to the conversation…
      </span>
      <LiveConversationButton compact onClick={fn()} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Start voice" })
    ).toBeEnabled();
  },
};
