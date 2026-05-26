import { useSeedInitialPodTasks } from "@app/lib/swr/projects";
import type { LightWorkspaceType } from "@app/types/user";
import { Card, CardGrid, CheckIcon, Icon, Spinner } from "@dust-tt/sparkle";

interface SpaceConversationsActionsProps {
  owner: LightWorkspaceType;
  spaceId: string;
  isEditor: boolean;
  onOpenMembersPanel: () => void;
  onNavigateToTasks: () => void;
}

export function SpaceConversationsActions({
  owner,
  spaceId,
  isEditor,
  onNavigateToTasks,
}: SpaceConversationsActionsProps) {
  const { seedInitialPodTasks, isSeeding } = useSeedInitialPodTasks({
    owner,
    spaceId,
  });

  const handleOnboardingClick = async () => {
    if (isEditor) {
      const result = await seedInitialPodTasks();
      if (result.isErr()) {
        return;
      }
    }

    onNavigateToTasks?.();
  };

  const suggestions = [
    {
      id: "onboarding-tasks",
      label: "Get your Pod off the ground",
      icon: CheckIcon,
      description:
        "Add context, connect your knowledge, and bring the right people in.",
      variant: "highlight" as const,
      isPulsing: true,
      onClick: () => {
        void handleOnboardingClick();
      },
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="heading-lg text-foreground dark:text-foreground-night">
        New Pod? Let us help you setup.
      </h3>
      <CardGrid>
        {suggestions.map((suggestion) => (
          <Card
            key={suggestion.id}
            variant={suggestion.variant}
            size="lg"
            isPulsing={suggestion.isPulsing && !isSeeding}
            onClick={isSeeding ? undefined : suggestion.onClick}
            className={isSeeding ? "cursor-wait opacity-80" : "cursor-pointer"}
          >
            <div className="flex w-full flex-col gap-2 text-sm">
              <div className="flex w-full items-center gap-2 font-semibold text-foreground dark:text-foreground-night">
                {isSeeding ? (
                  <Spinner size="xs" />
                ) : (
                  <Icon visual={suggestion.icon} size="sm" />
                )}
                <div className="w-full">{suggestion.label}</div>
              </div>
              <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                {isSeeding
                  ? "Setting up your starter tasks…"
                  : suggestion.description}
              </div>
            </div>
          </Card>
        ))}
      </CardGrid>
    </div>
  );
}
