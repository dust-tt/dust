import { Spinner } from "@dust-tt/sparkle";

export function ConversationViewerEmptyState() {
  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
      <Spinner variant="color" size="xl" />
    </div>
  );
}
