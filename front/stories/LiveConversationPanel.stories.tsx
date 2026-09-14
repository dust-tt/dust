/** @jsxRuntime automatic */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef } from "react";
import { expect, fn } from "storybook/test";
import { LiveConversationPanel } from "../components/assistant/conversation/LiveConversationPanel";

const meta = {
  title: "Dust/Live voice",
  component: LiveConversationPanel,
  args: {
    agents: [
      { sId: "dust", name: "Dust" },
      { sId: "research", name: "Research" },
    ],
    agentId: "dust",
    agentsLoading: false,
    status: "idle",
    muted: false,
    seconds: 0,
    transcript: [],
    error: null,
    taskStatus: null,
    audioRef: createRef<HTMLAudioElement>(),
    onAgentChange: fn(),
    onStart: fn(),
    onStop: fn(),
    onToggleMute: fn(),
  },
  render: (args) => (
    <div className="max-w-3xl p-4">
      <LiveConversationPanel {...args} />
    </div>
  ),
} satisfies Meta<typeof LiveConversationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Start a voice session from an existing Dust conversation. */
export const Ready: Story = {
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Start voice" }));
    await expect(args.onStart).toHaveBeenCalledOnce();
  },
};

/** Cancel while the microphone and network are connecting. */
export const Connecting: Story = {
  args: { status: "connecting" },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};

/** Keep captions and chat approvals visible during a live call. */
export const ApprovalNeeded: Story = {
  args: {
    status: "connected",
    seconds: 42,
    taskStatus: "Your input is needed in chat",
    transcript: [
      {
        id: "1",
        speaker: "user",
        text: "Can you update the project?",
        startMs: 0,
        endMs: 1000,
      },
      {
        id: "2",
        speaker: "assistant",
        text: "Please review the approval in the chat.",
        startMs: 1000,
        endMs: 2000,
      },
    ],
  },
  play: async ({ canvas, args, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Mute" }));
    await expect(args.onToggleMute).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole("button", { name: "End call" }));
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};

/** Show an actionable error and allow another connection attempt. */
export const MicrophoneDenied: Story = {
  args: {
    status: "error",
    error:
      "Microphone access was denied. Allow microphone access in your browser and try again.",
  },
};
