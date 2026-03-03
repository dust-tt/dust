import { AnimatedText, SparklesIcon } from "@dust-tt/sparkle";

export function ButlerThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 py-2 pl-2">
      <SparklesIcon className="s-h-4 s-w-4 s-text-highlight" />
      <AnimatedText variant="highlight" className="s-text-xs s-font-semibold">
        Butler is thinking...
      </AnimatedText>
    </div>
  );
}
