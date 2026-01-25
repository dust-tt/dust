import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import type {
  VoicePickerProps,
  VoicePickerStatus,
} from "@sparkle/index_with_tw_base";
import { VoicePicker } from "@sparkle/index_with_tw_base";

const meta = {
  title: "Primitives/VoicePicker",
  component: VoicePicker,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  argTypes: {
    status: { control: false },
    level: { control: false },
    elapsedSeconds: { control: false },
    onRecordStart: { control: false },
    onRecordStop: { control: false },
    buttonProps: { control: false },
    size: {
      control: { type: "select" },
      options: ["xs", "sm", "md"],
    },
    disabled: {
      control: "boolean",
    },
    showStopLabel: {
      control: "boolean",
    },
    pressDelayMs: {
      control: "number",
    },
  },
} satisfies Meta<typeof VoicePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

type VoicePickerDemoProps = Pick<
  VoicePickerProps,
  "size" | "disabled" | "showStopLabel" | "pressDelayMs"
>;

export const Interactive: Story = {
  args: {
    status: "idle",
    level: 0,
    elapsedSeconds: 0,
    onRecordStart: async () => {},
    onRecordStop: async () => {},
    size: "xs",
    disabled: false,
    showStopLabel: true,
    pressDelayMs: 150,
  },
  render: function Render(args: VoicePickerProps): React.ReactElement {
    return (
      <VoicePickerDemo
        size={args.size}
        disabled={args.disabled}
        showStopLabel={args.showStopLabel}
        pressDelayMs={args.pressDelayMs}
      />
    );
  },
};

function VoicePickerDemo({
  size,
  disabled,
  showStopLabel,
  pressDelayMs,
}: VoicePickerDemoProps): React.ReactElement {
  const [status, setStatus] = React.useState<VoicePickerStatus>("idle");
  const [level, setLevel] = React.useState(0);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  const elapsedIntervalRef = React.useRef<number | null>(null);
  const levelIntervalRef = React.useRef<number | null>(null);
  const transcribeTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      clearIntervalRef(elapsedIntervalRef);
      clearIntervalRef(levelIntervalRef);
      clearTimeoutRef(transcribeTimeoutRef);
    };
  }, []);

  React.useEffect(() => {
    if (status !== "recording") {
      clearIntervalRef(elapsedIntervalRef);
      clearIntervalRef(levelIntervalRef);
      setElapsedSeconds(0);
      setLevel(0);
      return;
    }

    elapsedIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);

    levelIntervalRef.current = window.setInterval(() => {
      setLevel(Math.random());
    }, 200);

    return () => {
      clearIntervalRef(elapsedIntervalRef);
      clearIntervalRef(levelIntervalRef);
    };
  }, [status]);

  async function handleRecordStart(): Promise<void> {
    clearTimeoutRef(transcribeTimeoutRef);
    setStatus("recording");
  }

  async function handleRecordStop(): Promise<void> {
    if (status !== "recording") {
      return;
    }
    setStatus("transcribing");
    clearTimeoutRef(transcribeTimeoutRef);
    transcribeTimeoutRef.current = window.setTimeout(() => {
      setStatus("idle");
    }, 1200);
  }

  return (
    <div className="s-flex s-items-center s-gap-2">
      <VoicePicker
        status={status}
        level={level}
        elapsedSeconds={elapsedSeconds}
        onRecordStart={handleRecordStart}
        onRecordStop={handleRecordStop}
        size={size}
        disabled={disabled}
        showStopLabel={showStopLabel}
        pressDelayMs={pressDelayMs}
      />
    </div>
  );
}

function clearIntervalRef(ref: React.MutableRefObject<number | null>): void {
  if (ref.current !== null) {
    window.clearInterval(ref.current);
    ref.current = null;
  }
}

function clearTimeoutRef(ref: React.MutableRefObject<number | null>): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}
