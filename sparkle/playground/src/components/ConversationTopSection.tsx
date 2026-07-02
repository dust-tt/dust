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
    <div className="flex flex-col gap-4 h-[30%] min-h-60 max-h-[320px] w-[100%] max-w-3xl mx-auto flex-none items-center justify-center px-4">
      {children}
    </div>
  );
}
