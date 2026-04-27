import { useCancelWakeUp } from "@app/lib/swr/wakeups";
import { describeWakeUpSchedule } from "@app/lib/utils/wakeup_description";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionTimeIcon,
  ActionTrashIcon,
  ContentMessageAction,
  ContentMessageInline,
} from "@dust-tt/sparkle";

interface WakeUpBannerProps {
  wakeUp: WakeUpType;
  owner: LightWorkspaceType;
  conversationId: string;
  isOwner: boolean;
}

// TODO(wake-up): PR 7 will add an owner-only overflow DropdownMenu alongside
// the cancel action. Deferred for now because ContentMessageInline's
// action-child filter only accepts ContentMessageAction at the top level,
// and the menu wrapper needs a different integration.
export const WakeUpBanner = ({
  wakeUp,
  owner,
  conversationId,
  isOwner,
}: WakeUpBannerProps) => {
  const { cancelWakeUp } = useCancelWakeUp({ owner, conversationId });
  const scheduleDescription = describeWakeUpSchedule(wakeUp);

  return (
    <ContentMessageInline
      icon={ActionTimeIcon}
      variant="outline"
      className="mb-5 flex max-h-dvh w-full bg-background dark:bg-background-night"
    >
      {/* ContentMessageInline variant="outline" renders all content children
          in text-muted-foreground by default; override the reason to the
          normal foreground color, let the schedule text inherit the muted
          color. */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-foreground dark:text-foreground-night">
          {wakeUp.reason}
        </span>
        <span className="shrink-0">{scheduleDescription}</span>
      </div>
      {isOwner && (
        <ContentMessageAction
          icon={ActionTrashIcon}
          variant="ghost"
          size="xs"
          tooltip="Cancel wake-up"
          className="text-muted-foreground dark:text-muted-foreground-night"
          onClick={() => {
            void cancelWakeUp(wakeUp.sId);
          }}
        />
      )}
    </ContentMessageInline>
  );
};
