/** @jsxRuntime automatic */
import { ArrowUp, Button, Composer, Plus, Robot } from "@dust-tt/sparkle";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fireEvent, fn } from "storybook/test";
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
    const active =
      !ended &&
      (started || (args.status !== "idle" && args.status !== "closed"));
    const callInProgress =
      active &&
      (started || ["connecting", "connected", "closing"].includes(args.status));
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
                {!callInProgress && (
                  <LiveConversationButton
                    size="xs"
                    agentName={args.agentName}
                    onClick={() => {
                      setStarted(true);
                      setEnded(false);
                    }}
                  />
                )}
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
    ).toHaveTextContent("Voice is on");
    await expect(
      canvas.queryByRole("button", { name: "Start voice" })
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Mute" }));
    await expect(canvas.getByText("Mic off")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Unmute" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Unmute" }));
    await expect(canvas.getByText("Voice is on")).toBeVisible();
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
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show transcript" })
    );
    await expect(
      canvas.getByRole("region", { name: "Voice transcript" })
    ).toHaveTextContent("I can help with that.");
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide transcript" })
    );
    await expect(
      canvas.queryByRole("region", { name: "Voice transcript" })
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Mute" })).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "End call" })
    ).toBeEnabled();
    await expect(args.onStop).not.toHaveBeenCalled();
  },
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
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show transcript" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide transcript" })
    );
    await expect(
      canvas.getByText("Your input is needed in chat")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "End call" })
    ).toBeEnabled();
  },
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

/** @summary A muted microphone does not stop playback or ongoing tool work. */
export const MutedWhileWorking: Story = {
  args: {
    status: "connected",
    muted: true,
    taskStatus: "Searching workspace knowledge…",
    transcript: [
      {
        id: "1",
        speaker: "user",
        text: "Find our latest onboarding guide.",
        startMs: 0,
        endMs: 1000,
      },
      {
        id: "2",
        speaker: "assistant",
        text: "I'll find it. Is this for an engineer or someone joining the sales team?",
        startMs: 1001,
        endMs: 3000,
      },
    ],
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByText("Searching workspace knowledge…")
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Unmute" }));
    await expect(canvas.getByText("Voice is on")).toBeVisible();
    await expect(
      canvas.getByText("Searching workspace knowledge…")
    ).toBeVisible();
  },
};

/** @summary Keep the dock visible until the call has finished closing. */
export const EndingCall: Story = {
  args: { status: "closing" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ending call…")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "End call" })
    ).toBeDisabled();
    await expect(
      canvas.queryByRole("button", { name: "Start voice" })
    ).not.toBeInTheDocument();
  },
};

/** @summary Long agent names and captions fit a narrow conversation. */
export const NarrowConversation: Story = {
  play: async ({ canvas, userEvent }) => {
    const dock = canvas.getByRole("region", { name: "Live voice" });
    await expect(dock.scrollWidth).toBeLessThanOrEqual(dock.clientWidth);
    const agentName = canvas.getByText("@Customer-Support-Knowledge-Assistant");
    const mute = canvas.getByRole("button", { name: "Mute" });
    await expect(mute.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      agentName.getBoundingClientRect().bottom
    );
    await expect(mute.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      44
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Show transcript" })
    );
    await expect(
      canvas.getByRole("region", { name: "Voice transcript" })
    ).toBeVisible();
    await userEvent.tab();
    await expect(
      canvas.getByRole("region", { name: "Voice transcript" })
    ).toHaveFocus();
  },
  args: {
    ...Listening.args,
    agentName: "Customer-Support-Knowledge-Assistant",
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};

/** @summary New speech follows the transcript only while the reader is at the bottom. */
export const TranscriptHistory: Story = {
  args: { status: "connected" },
  render: function Render(args) {
    const [transcript, setTranscript] = useState(
      Array.from({ length: 20 }, (_, index) => ({
        id: String(index),
        speaker: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
        text:
          index % 2 === 0
            ? "Where can I find our team's onboarding guide?"
            : "The guide includes your first-week checklist, team contacts, and links to the tools you need.",
        startMs: index * 1000,
        endMs: index * 1000 + 900,
      }))
    );
    return (
      <div className="mx-auto max-w-[680px] p-4">
        <LiveConversationPanel {...args} transcript={transcript} />
        <Button
          label="Simulate new speech"
          onClick={() =>
            setTranscript([
              ...transcript,
              {
                id: String(transcript.length),
                speaker: "user",
                text: "Thank you. Can you also find the engineering handbook?",
                startMs: transcript.length * 1000,
                endMs: transcript.length * 1000 + 900,
              },
            ])
          }
        />
      </div>
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show transcript" })
    );
    const transcript = canvas.getByRole("region", { name: "Voice transcript" });
    await expect(transcript.scrollTop).toBeGreaterThan(0);
    transcript.scrollTop = 0;
    fireEvent.scroll(transcript);
    await userEvent.click(
      canvas.getByRole("button", { name: "Simulate new speech" })
    );
    await expect(transcript).toHaveTextContent("engineering handbook");
    await expect(transcript.scrollTop).toBe(0);
    await userEvent.click(
      canvas.getByRole("button", { name: "Hide transcript" })
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Show transcript" })
    );
    await expect(
      canvas.getByRole("region", { name: "Voice transcript" }).scrollTop
    ).toBeGreaterThan(0);
  },
};

/** @summary The call dock uses the same semantic colors as the dark composer. */
export const DarkConversation: Story = {
  args: Listening.args,
  globals: { theme: "dark" },
  play: Listening.play,
};

/** @summary The entry point stays busy while a new conversation is being created. */
export const StartingConversation: Story = {
  render: () => <LiveConversationButton isLoading onClick={fn()} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Start voice" })
    ).toBeDisabled();
  },
};
