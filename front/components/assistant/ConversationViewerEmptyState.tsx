import { LoadingBlock } from "@dust-tt/sparkle";

export function ConversationViewerEmptyState() {
  return (
    <div className="mx-auto flex h-full w-full min-w-60 max-w-3xl flex-col pt-6 md:pt-10">
      <FakeUserMessage />
      <FakeAgentMessage />
    </div>
  );
}

function FakeUserMessage() {
  return (
    <div className="min-w-60 max-w-full self-end">
      <LoadingBlock className="h-[125px] w-[350px] rounded-xl" />
    </div>
  );
}

function FakeAgentMessage() {
  return (
    <div className="mt-8">
      <div className="flex flex-col space-y-3">
        <div className="mb-2 flex flex-row items-center gap-x-2">
          <LoadingBlock className="h-[36px] w-[36px]" />
          <LoadingBlock className="h-4 w-[120px]" />
        </div>
        <LoadingBlock className="h-4 w-[450px]" />
        <LoadingBlock className="h-4 w-[475px]" />
        <LoadingBlock className="h-4 w-[350px]" />
        <LoadingBlock className="h-4 w-[450px]" />
        <LoadingBlock className="h-4 w-[375px]" />
      </div>
    </div>
  );
}
