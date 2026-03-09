import { LoadingBlock } from "@dust-tt/sparkle";

export function SpaceLoadingConversationListItem() {
  return (
    <div className="flex flex-row gap-4 py-2">
      <LoadingBlock className="h-[36px] w-[36px] rounded-full" />
      <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row gap-2 items-center">
          <LoadingBlock className="h-[24px] w-[20%]" />
          <LoadingBlock className="h-[24px] w-[40%]" />
          <div className="flex flex-grow" />
          <LoadingBlock className="h-[20px] w-[10%]" />
        </div>
        <LoadingBlock className="h-[22px] w-[99%]" />
        <LoadingBlock className="h-[22px] w-[80%]" />
        <div className="flex flex-row gap-2 items-center">
          <LoadingBlock className="h-[28px] w-[28px] rounded-full" />
          <LoadingBlock className="h-[20px] w-[30%]" />
        </div>
      </div>
    </div>
  );
}
