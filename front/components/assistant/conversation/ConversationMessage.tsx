import { Avatar } from "@dust-tt/sparkle";

/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export function ConversationMessage({
  children,
  name,
  pictureUrl,
}: {
  children?: React.ReactNode;
  name: string | null;
  pictureUrl?: string | null;
}) {
  return (
    <div className="flex w-full flex-row gap-4">
      <div className="flex-shrink-0">
        <Avatar visual={pictureUrl} name={name || undefined} size="sm" />
      </div>
      <div className="flex-grow">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium">{name}</div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}
