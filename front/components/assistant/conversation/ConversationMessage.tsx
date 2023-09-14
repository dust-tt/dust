/**
 * Parent component for both UserMessage and AgentMessage, to ensure avatar,
 * side buttons and spacing are consistent between the two
 */
export function ConversationMessage({
  avatar,
  name,
  children,
}: {
  avatar: React.ReactNode | null;
  name: string | null;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex-shrink-0">{avatar || ""}</div>
      <div className="flex-grow">
        <div className="mb-2 text-sm font-medium">{name}</div>
        <div className="flex flex-col">{children}</div>
      </div>
    </>
  );
}
