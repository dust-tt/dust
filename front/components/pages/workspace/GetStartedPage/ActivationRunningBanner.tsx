import { useAppRouter } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type { WorkspaceType } from "@app/types/user";
import { ArrowRight, Button, Spinner } from "@dust-tt/sparkle";

interface ActivationRunningBannerProps {
  owner: WorkspaceType;
  runningConversation: PodConversationListItemType;
  message: string;
}

export function ActivationRunningBanner({
  owner,
  runningConversation,
  message,
}: ActivationRunningBannerProps) {
  const router = useAppRouter();

  return (
    <div className="py-4">
      <div className="flex items-center gap-2">
        <Spinner size="xs" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <div className="mt-4">
        <Button
          variant="outline"
          size="sm"
          label="Go to conversation"
          iconRight={ArrowRight}
          onClick={() =>
            void router.push(
              getConversationRoute(owner.sId, runningConversation.id),
              undefined,
              { shallow: true }
            )
          }
        />
      </div>
    </div>
  );
}
