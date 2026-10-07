import { useSeedInitialPodTasks } from "@app/lib/swr/pods";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, MagicWand02 } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
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
      <h3 className="heading-lg text-foreground">
        <Trans>It's quiet in here.</Trans>
      </h3>
      <div className="text-sm text-muted-foreground">
        <Trans>
          Your Pod is ready but empty! Let us help you invite people, add key
          data, and more.
        </Trans>
      </div>
      <Button
        label={t`Let's go`}
        icon={MagicWand02}
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
