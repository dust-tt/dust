import { useSeedInitialPodTasks } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, MagicIcon } from "@dust-tt/sparkle";

interface PodEmptyCalloutProps {
  owner: LightWorkspaceType;
  podId: string;
  isEditor: boolean;
  onNavigateToTasks: () => void;
}

export function PodEmptyCallout({
  owner,
  podId,
  isEditor,
  onNavigateToTasks,
}: PodEmptyCalloutProps) {
  const { seedInitialPodTasks, isSeeding } = useSeedInitialPodTasks({
    owner,
    podId: podId,
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

  return (
    <div className="flex flex-col gap-3 items-center justify-center">
      <h3 className="heading-lg text-foreground dark:text-foreground-night">
        It's quiet in here.
      </h3>
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Your Pod is ready but empty! Let us help you invite people, add key
        data, and more.
      </div>
      <Button
        label="Let's go"
        icon={MagicIcon}
        isPulsing
        disabled={isSeeding}
        isLoading={isSeeding}
        onClick={handleOnboardingClick}
        variant="highlight"
        size="md"
      />
    </div>
  );
}
