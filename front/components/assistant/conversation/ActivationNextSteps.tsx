import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ActivationRecommendationForUserType } from "@app/lib/api/activation/recommendations";
import { useAppRouter } from "@app/lib/platform";
import {
  useActivationRecommendations,
  useUpdateActivationRecommendation,
} from "@app/lib/swr/activation";
import { classNames } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionSparklesIcon,
  Button,
  ChevronDown,
  CornerDownLeft,
  Icon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  XClose,
} from "@dust-tt/sparkle";
import { useContext, useState } from "react";

interface ActivationNextStepsProps {
  owner: LightWorkspaceType;
}

export function ActivationNextSteps({ owner }: ActivationNextStepsProps) {
  const router = useAppRouter();
  const { setPendingInputText, setShouldFocusInput } =
    useContext(InputBarContext);
  const [isOpen, setIsOpen] = useState(false);

  const { recommendations, isRecommendationsLoading, mutateRecommendations } =
    useActivationRecommendations({ workspaceId: owner.sId });
  const { updateRecommendation } = useUpdateActivationRecommendation({
    workspaceId: owner.sId,
  });

  if (isRecommendationsLoading || recommendations.length === 0) {
    return null;
  }

  const handleSelect = (rec: ActivationRecommendationForUserType) => {
    setIsOpen(false);

    if (rec.conversationId) {
      void router.push(getConversationRoute(owner.sId, rec.conversationId));
      return;
    }

    setPendingInputText(rec.content, { replace: true });
    setShouldFocusInput(true);
  };

  const handleDismiss = async (
    e: React.MouseEvent,
    rec: ActivationRecommendationForUserType
  ) => {
    e.stopPropagation();

    await mutateRecommendations(
      (current) => ({
        recommendations: (current?.recommendations ?? []).filter(
          (r) => r.sId !== rec.sId
        ),
      }),
      { revalidate: false }
    );

    await updateRecommendation(rec.sId, { status: "dismissed" });
    void mutateRecommendations();
  };

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={classNames(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5",
            "bg-highlight-50 text-sm font-medium text-highlight-600",
            "transition-colors hover:bg-highlight-100"
          )}
        >
          <Icon visual={ActionSparklesIcon} size="xs" />
          <span>Your next steps</span>
          <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-highlight-500 px-1 text-xs font-semibold text-white">
            {recommendations.length}
          </span>
          <Icon visual={ChevronDown} size="xs" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-[420px] p-0">
        <div className="flex flex-col">
          {recommendations.map((rec) => (
            <div
              key={rec.sId}
              className={classNames(
                "flex w-full items-center gap-2 px-3 py-2.5",
                "border-b border-border last:border-b-0",
                "hover:bg-muted-background"
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {rec.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {rec.content}
                </span>
              </div>
              <Button
                icon={XClose}
                size="mini"
                variant="ghost-secondary"
                tooltip="Dismiss"
                onClick={(e) => void handleDismiss(e, rec)}
              />
              <Button
                icon={CornerDownLeft}
                size="mini"
                variant="ghost-secondary"
                tooltip="Try this"
                onClick={() => handleSelect(rec)}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
