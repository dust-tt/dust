import type { ReactNode } from "react";

interface ConversationTopSectionProps {
  children: ReactNode;
}

/**
 * Shared "hero" region used at the top of conversation surfaces (NewConversation
 * and the group conversation tabs). Centralizes the sizing rules — a tall,
 * vertically centered, non-scrolling band holding the header + input in a
 * max-width column — so they stay consistent across every surface.
 */
export function ConversationTopSection({
  children,
}: ConversationTopSectionProps) {
  return (
    <div className="s-flex s-h-[30%] s-min-h-60 s-max-h-[320px] s-flex-none s-items-center s-justify-center s-px-4">
      <div className="s-flex s-w-full s-max-w-4xl s-flex-col s-gap-4">
        {children}
      </div>
    </div>
  );
}
