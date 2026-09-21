/** @jsxRuntime automatic */
import { Button } from "@dust-tt/sparkle";

interface VoiceWaveformProps {
  className?: string;
}

function VoiceWaveform({ className }: VoiceWaveformProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10v4m4-7v10m4-13v16m4-13v10m4-7v4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface LiveConversationButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  agentName?: string;
  compact?: boolean;
  size?: "xs" | "sm" | "md";
}

export function LiveConversationButton({
  onClick,
  disabled,
  isLoading,
  agentName,
  compact,
  size = "sm",
}: LiveConversationButtonProps) {
  return (
    <Button
      icon={VoiceWaveform}
      label={compact ? undefined : "Voice"}
      tooltip={
        agentName ? `Talk to @${agentName}` : "Start a voice conversation"
      }
      aria-label="Start voice"
      variant="outline"
      size={size}
      isRounded
      isLoading={isLoading}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    />
  );
}
