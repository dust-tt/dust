/** @jsxRuntime automatic */
import { mergeLiveTranscript } from "@app/lib/client/live";
import type {
  LiveConnectionStatus,
  LiveTranscriptFragment,
} from "@app/types/assistant/live";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { RefObject } from "react";

interface LiveConversationPanelProps {
  agents: { sId: string; name: string }[];
  agentId: string;
  agentsLoading: boolean;
  status: LiveConnectionStatus;
  muted: boolean;
  seconds: number;
  transcript: LiveTranscriptFragment[];
  error: string | null;
  taskStatus: string | null;
  audioRef: RefObject<HTMLAudioElement>;
  onAgentChange: (agentId: string) => void;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
}

const STATUS_LABELS: Record<LiveConnectionStatus, string> = {
  idle: "Live voice",
  connecting: "Connecting…",
  connected: "Listening",
  closing: "Ending call…",
  closed: "Call ended",
  error: "Voice unavailable",
};

export function LiveConversationPanel({
  agents,
  agentId,
  agentsLoading,
  status,
  muted,
  seconds,
  transcript,
  error,
  taskStatus,
  audioRef,
  onAgentChange,
  onStart,
  onStop,
  onToggleMute,
}: LiveConversationPanelProps) {
  const active =
    status === "connected" || status === "connecting" || status === "closing";
  const agent = agents.find((candidate) => candidate.sId === agentId);
  const captions = mergeLiveTranscript(transcript).slice(-4);

  return (
    <section
      aria-label="Live voice"
      className="mx-auto flex w-full max-w-conversation flex-col gap-3 rounded-xl border border-border bg-background p-3 text-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" role="status">
            {status === "connected" && muted
              ? "Microphone muted"
              : STATUS_LABELS[status]}
          </span>
          {active && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.floor(seconds / 60)}:
              {String(Math.floor(seconds % 60)).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                label={agent ? `@${agent.name}` : "Choose an agent"}
                variant="ghost"
                isSelect
                disabled={active || agentsLoading}
                isLoading={agentsLoading}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {agents.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.sId}
                  label={`@${candidate.name}`}
                  onClick={() => onAgentChange(candidate.sId)}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {status === "connected" && (
            <Button
              label={muted ? "Unmute" : "Mute"}
              variant="outline"
              size="md"
              onClick={onToggleMute}
            />
          )}
          {active ? (
            <Button
              label={status === "connecting" ? "Cancel" : "End call"}
              variant="warning"
              size="md"
              disabled={status === "closing"}
              isLoading={status === "closing"}
              onClick={onStop}
            />
          ) : (
            <Button
              label="Start voice"
              variant="highlight"
              size="md"
              disabled={!agent || agentsLoading}
              onClick={onStart}
            />
          )}
        </div>
      </div>
      {active && (
        <>
          <p className="text-xs text-muted-foreground">
            GPT-Live voice · Approvals and questions appear in chat. Ending the
            call leaves Dust tasks running.
          </p>
          <div
            aria-label="Live captions"
            className="max-h-28 overflow-y-auto text-sm"
          >
            {captions.length === 0 ? (
              <p className="text-muted-foreground">
                Speak naturally. You can interrupt at any time.
              </p>
            ) : (
              captions.map((caption) => (
                <p key={caption.id}>
                  <span className="font-medium">
                    {caption.speaker === "user" ? "You" : "Voice"}:{" "}
                  </span>
                  {caption.text}
                </p>
              ))
            )}
          </div>
        </>
      )}
      {taskStatus && (
        <p role="status" className="text-sm text-muted-foreground">
          {taskStatus}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-warning-600">
          {error}
        </p>
      )}
      <audio
        ref={audioRef}
        autoPlay
        controls={active}
        aria-label="Voice playback"
        className={active ? "h-8 w-full" : "hidden"}
      />
    </section>
  );
}
