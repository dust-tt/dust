import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import type { ActivationRecommendationForUserType } from "@app/lib/api/activation/recommendations";
import { useAppRouter } from "@app/lib/platform";
import {
  useActivationRecommendations,
  useUpdateActivationRecommendation,
} from "@app/lib/swr/activation";
import { getConversationRoute } from "@app/lib/utils/router";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionSparklesIcon,
  ArrowRight,
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  XClose,
} from "@dust-tt/sparkle";
import { useContext, useState } from "react";

interface ActivationNextStepsProps {
  owner: LightWorkspaceType;
  podId?: string;
}

export function ActivationNextSteps({
  owner,
  podId,
}: ActivationNextStepsProps) {
  const router = useAppRouter();
  const { setPendingInputText, setShouldFocusInput } =
    useContext(InputBarContext);
  const [isOpen, setIsOpen] = useState(false);

  const { recommendations, isRecommendationsLoading, mutateRecommendations } =
    useActivationRecommendations({ workspaceId: owner.sId, podId });
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
        <Button
          variant="highlight"
          size="sm"
          icon={ActionSparklesIcon}
          label="Recommendations for you"
          isSelect
        />
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[440px] max-w-[90vw] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {/* Says what these are, why the user is seeing them, and that
              nothing runs without confirmation. */}
          <div className="border-b border-border p-4">
            <p className="text-xs text-muted-foreground">
              We picked a few next steps for you that fit how you already work.
              Open a conversation and we'll walk you through it.
            </p>
          </div>
          {recommendations.map((rec) => (
            <div
              key={rec.sId}
              className="flex w-full items-start gap-2 border-b border-border p-4 last:border-b-0 hover:bg-muted-background"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {rec.title}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {rec.content}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  icon={XClose}
                  tooltip="Not for me"
                  size="xs"
                  variant="ghost"
                  onClick={(e) => void handleDismiss(e, rec)}
                />
                <Button
                  icon={ArrowRight}
                  label={
                    rec.conversationId
                      ? "Open conversation"
                      : "Start conversation"
                  }
                  size="xs"
                  variant="highlight"
                  onClick={() => handleSelect(rec)}
                />
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
