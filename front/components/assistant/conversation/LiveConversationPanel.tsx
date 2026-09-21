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
  MessageTextCircle01,
  Microphone01,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useId, useRef, useState } from "react";

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
  connected: "Voice is on",
  closing: "Ending call…",
  closed: "Call ended",
  error: "Voice unavailable",
};

/**
 * @cc [owner:aubin-tchoi,label:product] voice-controls-stay-visible
 * Collapsing the transcript MUST NOT hide call controls, tool progress, or errors.
 * Transcript updates MUST NOT scroll away from earlier turns the user is reading.
 */
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
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptId = useId();
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);
  const turns = mergeLiveTranscript(transcript);
  const caption = turns.at(-1);
  const isConnected = status === "connected";

  useEffect(() => {
    const element = transcriptRef.current;
    if (
      showTranscript &&
      transcript.length > 0 &&
      element &&
      followTranscript.current
    ) {
      element.scrollTop = element.scrollHeight;
    }
  }, [transcript, showTranscript]);

  return (
    <section
      aria-label="Live voice"
      className="@container mb-2 w-full overflow-hidden rounded-3xl border border-border bg-input-bar-background text-foreground"
    >
      <div className="flex flex-col gap-2 px-3 py-2 @sm:min-h-16 @sm:flex-row @sm:items-center @sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background">
            <Icon
              visual={Headphones01}
              size="sm"
              className={
                isConnected && !muted
                  ? "text-highlight"
                  : "text-muted-foreground"
              }
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">@{agentName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                role="status"
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                {isConnected && (
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${muted ? "bg-muted-foreground" : "bg-highlight"}`}
                  />
                )}
                {isConnected && muted ? "Mic off" : STATUS_LABELS[status]}
              </span>
              {isConnected && (
                <span className="tabular-nums">
                  {Math.floor(seconds / 60)}:
                  {String(Math.floor(seconds % 60)).padStart(2, "0")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1 [&_button]:min-h-11">
          {isConnected && (
            <Button
              icon={Microphone01}
              label={muted ? "Unmute" : "Mute"}
              tooltip={muted ? "Turn microphone on" : "Turn microphone off"}
              aria-label={muted ? "Unmute" : "Mute"}
              variant={muted ? "warning" : "outline"}
              size="md"
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
            variant="outline"
            size="md"
            isRounded
            disabled={status === "closing"}
            isLoading={status === "closing"}
            onClick={onStop}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-warning-600">
          {error}
        </p>
      )}
      {(isConnected || turns.length > 0) && (
        <div className="border-t border-border px-4 py-2">
          <div className="flex min-h-11 items-center justify-between gap-2 [&_button]:min-h-11 [&_button]:min-w-11">
            <p role="status" className="min-w-0 text-xs text-muted-foreground">
              {taskStatus ??
                (isConnected &&
                  (muted
                    ? "You can still hear the reply."
                    : "Speak naturally. You can interrupt anytime."))}
            </p>
            <Button
              icon={MessageTextCircle01}
              tooltip={showTranscript ? "Hide transcript" : "Show transcript"}
              aria-label={
                showTranscript ? "Hide transcript" : "Show transcript"
              }
              aria-expanded={showTranscript}
              aria-controls={transcriptId}
              variant={showTranscript ? "highlight-ghost" : "ghost"}
              size="sm"
              isRounded
              onClick={() => {
                followTranscript.current = true;
                setShowTranscript(!showTranscript);
              }}
            />
          </div>
          {!showTranscript && caption && (
            <p
              aria-label="Live captions"
              className="line-clamp-2 break-words pb-1 text-sm text-muted-foreground"
            >
              <span className="font-medium text-foreground">
                {caption.speaker === "user" ? "You" : `@${agentName}`}:{" "}
              </span>
              {caption.text}
            </p>
          )}
          {showTranscript && (
            <div
              id={transcriptId}
              ref={transcriptRef}
              role="region"
              aria-label="Voice transcript"
              tabIndex={0}
              className="my-2 h-48 overflow-y-auto overscroll-contain rounded-xl bg-background p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              onScroll={(event) => {
                const element = event.currentTarget;
                followTranscript.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  24;
              }}
            >
              {turns.length > 0 ? (
                <ol className="space-y-3">
                  {turns.map((turn) => (
                    <li key={turn.id} className="space-y-0.5">
                      <p className="break-words text-xs font-medium text-muted-foreground">
                        {turn.speaker === "user" ? "You" : `@${agentName}`}
                      </p>
                      <p className="whitespace-pre-wrap break-words">
                        {turn.text}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">
                  Your conversation will appear here as you speak.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {!isConnected && turns.length === 0 && taskStatus && (
        <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">
          {taskStatus}
        </p>
      )}
    </section>
  );
}
