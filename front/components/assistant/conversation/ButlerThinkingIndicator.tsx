import { AnimatedText } from "@dust-tt/sparkle";
import { Sparkles } from "@app/components/assistant/conversation/icons";

export function ButlerThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-2 pl-2">
      <Sparkles className="h-4 w-4 text-highlight" />
      <AnimatedText variant="highlight" className="text-xs font-semibold">
        Butler is thinking...
      </AnimatedText>
    </div>
  );
}
