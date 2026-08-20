import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import type {
  VoicePickerProps,
  VoicePickerStatus,
} from "@sparkle/index_with_tw_base";
import { VoicePicker } from "@sparkle/index_with_tw_base";

const meta = {
  title: "Forms & Inputs/VoicePicker",
  component: VoicePicker,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A push-to-talk button for capturing voice and transcribing it to text. It is a controlled component driven by **status** (\`"idle"\`, \`"authorizing_microphone"\`, \`"recording"\`, \`"transcribing"\`), an audio **level** for the live waveform, and **elapsedSeconds**, firing **onRecordStart** / **onRecordStop**. Supports **size** (\`xs\` / \`sm\` / \`md\`), **disabled**, a **showStopLabel** toggle, and a **pressDelayMs** that distinguishes hold-to-record from click-to-toggle.

**When to use**
- To let users dictate input by voice, such as recording a message before sending.

**Guidelines**
- Own the recording lifecycle yourself: keep **status**, **level**, and **elapsedSeconds** in state and update them from your capture logic.
- Tune **pressDelayMs** to set how long a press must be held before it counts as hold-to-record rather than a click toggle.`,
      },
    },
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

const noopRecordingHandlers = {
  onRecordStart: async () => {},
  onRecordStop: async () => {},
};

/**
 * The resting state, ready to record. Static and fully args-driven — see
 * `SimulatedRecordingLifecycle` for the full state machine in motion.
 *
 * @summary Idle push-to-talk button.
 */
export const Idle: Story = {
  args: {
    status: "idle",
    level: 0,
    elapsedSeconds: 0,
    size: "xs",
    showStopLabel: true,
    ...noopRecordingHandlers,
  },
};

/**
 * Mid-recording: the live waveform is driven by `level` (0–1) and the timer
 * by `elapsedSeconds` — update both from your audio capture loop.
 *
 * @summary Recording with live level and elapsed time.
 */
export const Recording: Story = {
  args: {
    status: "recording",
    level: 0.6,
    elapsedSeconds: 7,
    size: "xs",
    showStopLabel: true,
    ...noopRecordingHandlers,
  },
};

const TranscribingLoopDemo = () => {
  const [status, setStatus] = React.useState<VoicePickerStatus>("transcribing");

  React.useEffect(() => {
    // Story scaffolding: restart the transcribing phase every few seconds so
    // the fake-progress climb stays visible instead of parking at 99%.
    const loop = window.setInterval(() => {
      setStatus("idle");
      window.setTimeout(() => setStatus("transcribing"), 400);
    }, 4500);
    return () => window.clearInterval(loop);
  }, []);

  return (
    <VoicePicker
      status={status}
      level={0}
      elapsedSeconds={0}
      size="xs"
      showStopLabel
      {...noopRecordingHandlers}
    />
  );
};

/**
 * After stop, keep `status` at `transcribing` until your speech-to-text call
 * resolves. The percentage is a fake-progress estimate: it climbs toward 99%
 * and holds there until you flip `status` back — it never reaches 100% on its
 * own. The demo restarts the phase every few seconds so the climb is visible.
 *
 * @summary Waiting for transcription (fake progress holds at 99%).
 */
export const Transcribing: Story = {
  args: {
    status: "transcribing",
    level: 0,
    elapsedSeconds: 0,
    size: "xs",
    showStopLabel: true,
    ...noopRecordingHandlers,
  },
  render: () => <TranscribingLoopDemo />,
};

/**
 * Disabled, e.g. while the surrounding composer cannot accept input.
 *
 * @summary Disabled voice button.
 */
export const Disabled: Story = {
  args: {
    status: "idle",
    level: 0,
    elapsedSeconds: 0,
    size: "xs",
    disabled: true,
    showStopLabel: true,
    ...noopRecordingHandlers,
  },
};

/**
 * The full controlled lifecycle, simulated: press to record (level and
 * timer animate), release to transcribe, then back to idle. The
 * `status`/`level`/`elapsedSeconds` args are placeholders here — the demo
 * owns them in state, as your integration should.
 *
 * @summary Simulated record → transcribe → idle lifecycle.
 */
export const SimulatedRecordingLifecycle: Story = {
  args: {
    status: "idle",
    level: 0,
    elapsedSeconds: 0,
    size: "xs",
    disabled: false,
    showStopLabel: true,
    pressDelayMs: 150,
    ...noopRecordingHandlers,
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
      // Deterministic sawtooth so the waveform animates reproducibly.
      setLevel((previous) => (previous + 0.23) % 1);
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
    <div className="flex items-center gap-2">
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
