import { Avatar } from "@dust-tt/sparkle";

/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export function ConversationMessage({
  avatarVisual,
  children,
}: {
  avatarVisual?: string | React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex-shrink-0">
        {avatarVisual && <Avatar visual={avatarVisual} size="sm" />}
      </div>
      <div className="flex-grow">
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </>
  );
}
