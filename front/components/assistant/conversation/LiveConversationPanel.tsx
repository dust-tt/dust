/** @jsxRuntime automatic */
import { mergeLiveTranscript } from "@app/lib/client/live";
import type {
  LiveConnectionStatus,
  LiveTranscriptFragment,
} from "@app/types/assistant/live";
import {
  Button,
  Headphones01,
  Icon,
  Microphone01,
  XClose,
} from "@dust-tt/sparkle";

interface LiveConversationPanelProps {
  agentName: string;
  status: LiveConnectionStatus;
  muted: boolean;
  seconds: number;
  transcript: LiveTranscriptFragment[];
  error: string | null;
  taskStatus: string | null;
  onStop: () => void;
  onToggleMute: () => void;
}

const STATUS_LABELS: Record<LiveConnectionStatus, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  connected: "Listening",
  closing: "Ending call…",
  closed: "Call ended",
  error: "Voice unavailable",
};

export function LiveConversationPanel({
  agentName,
  status,
  muted,
  seconds,
  transcript,
  error,
  taskStatus,
  onStop,
  onToggleMute,
}: LiveConversationPanelProps) {
  const caption = mergeLiveTranscript(transcript).at(-1);
  return (
    <section
      aria-label="Live voice"
      className="mb-2 flex w-full flex-col gap-2 rounded-2xl border border-border bg-muted/70 p-3 text-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon
            visual={Headphones01}
            size="sm"
            className="shrink-0 text-highlight"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              <span className="hidden sm:inline">Voice with </span>@{agentName}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span role="status">
                {status === "connected" && muted
                  ? "Microphone muted"
                  : STATUS_LABELS[status]}
              </span>
              {status === "connected" && (
                <span className="tabular-nums">
                  {Math.floor(seconds / 60)}:
                  {String(Math.floor(seconds % 60)).padStart(2, "0")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status === "connected" && (
            <Button
              icon={Microphone01}
              label={muted ? "Unmute" : "Mute"}
              variant={muted ? "outline" : "ghost"}
              size="sm"
              isRounded
              onClick={onToggleMute}
            />
          )}
          <Button
            icon={XClose}
            label={
              status === "connecting"
                ? "Cancel"
                : status === "error"
                  ? "Dismiss"
                  : "End"
            }
            aria-label={
              status === "connecting"
                ? "Cancel voice"
                : status === "error"
                  ? "Dismiss voice error"
                  : "End call"
            }
            variant="ghost"
            size="sm"
            isRounded
            disabled={status === "closing"}
            isLoading={status === "closing"}
            onClick={onStop}
          />
        </div>
      </div>
      {caption && (
        <p
          aria-label="Live captions"
          className="line-clamp-2 text-sm text-muted-foreground"
        >
          <span className="font-medium">
            {caption.speaker === "user" ? "You" : `@${agentName}`}:{" "}
          </span>
          {caption.text}
        </p>
      )}
      {taskStatus && (
        <p role="status" className="text-xs text-muted-foreground">
          {taskStatus}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warning-600">
          {error}
        </p>
      )}
    </section>
  );
}
