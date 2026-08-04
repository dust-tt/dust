import { useCancelWakeUp } from "@app/lib/swr/wakeups";
import { describeWakeUpSchedule } from "@app/lib/utils/wakeup_description";
import type { WakeUpType } from "@app/types/assistant/wakeups";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Clock,
  ContentMessageAction,
  ContentMessageInline,
  Tooltip,
  Trash04,
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
      icon={Clock}
      variant="outline"
      className="mb-3 flex max-h-dvh w-full bg-background"
    >
      {/* ContentMessageInline variant="outline" renders all content children
          in text-muted-foreground by default; override the reason to the
          normal foreground color, let the schedule text inherit the muted
          color. */}
      <div className="flex min-w-0 items-center gap-2">
        {/* The mode lives in the existing details tooltip rather than as another visible chip:
            it matters when inspecting a wake-up, not at a glance. */}
        <Tooltip
          label={
            wakeUp.conversationContextMode === "isolated"
              ? `${wakeUp.reason}\n\nFresh context — each firing is answered without earlier conversation messages.`
              : wakeUp.reason
          }
          tooltipTriggerAsChild
          trigger={
            <span className="min-w-0 truncate text-foreground">
              {wakeUp.reason}
            </span>
          }
        />
        <span className="shrink-0">{scheduleDescription}</span>
      </div>
      {isOwner && (
        <ContentMessageAction
          icon={Trash04}
          variant="ghost"
          size="xs"
          tooltip="Cancel wake-up"
          className="text-muted-foreground"
          onClick={() => {
            void cancelWakeUp(wakeUp.sId);
          }}
        />
      )}
    </ContentMessageInline>
  );
};
