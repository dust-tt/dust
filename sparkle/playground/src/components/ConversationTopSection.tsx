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
    <div className="flex flex-none h-[30%] min-h-60 max-h-[320px] justify-center items-center px-4 pb-8">
      <div className="flex w-full max-w-4xl flex-col gap-3 justify-center items-center">
        {children}
      </div>
    </div>
  );
}
