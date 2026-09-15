/** @jsxRuntime automatic */
import { useLiveConversationContext } from "@app/components/assistant/conversation/LiveConversationContext";
import { LiveConversationPanel } from "@app/components/assistant/conversation/LiveConversationPanel";

interface LiveConversationProps {
  conversationId: string;
}

export function LiveConversation({ conversationId }: LiveConversationProps) {
  const voice = useLiveConversationContext();
  if (!voice) {
    return null;
  }
  const visible =
    voice.request?.conversationId === conversationId &&
    voice.live.status !== "idle" &&
    voice.live.status !== "closed";
  const showPlayback =
    visible && !!voice.live.error && voice.live.status === "connected";
  return (
    <>
      {visible && voice.request && (
        <LiveConversationPanel
          {...voice.live}
          agentName={voice.request.agent.name}
          onStop={voice.live.stop}
          onToggleMute={voice.live.toggleMute}
        />
      )}
      <audio
        ref={voice.audioRef}
        autoPlay
        controls={showPlayback}
        aria-label="Voice playback"
        className={showPlayback ? "mb-2 h-8 w-full" : "hidden"}
      />
    </>
  );
}
