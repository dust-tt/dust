import { useUpdateWorkspaceRegionalModelsOnly } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

interface RegionalModelsOnlyToggleProps {
  workspace: LightWorkspaceType;
}

export function RegionalModelsOnlyToggle({
  workspace,
}: RegionalModelsOnlyToggleProps) {
  const {
    updateWorkspaceRegionalModelsOnly,
    isUpdatingWorkspaceRegionalModelsOnly,
  } = useUpdateWorkspaceRegionalModelsOnly({ owner: workspace });

  return (
    <div className="mt-8 divide-y divide-gray-200 dark:divide-gray-200-night p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-left font-semibold text-foreground dark:text-foreground-night">
            🇪🇺 EU only
          </span>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Restrict available models to those whose endpoint is hosted in the
            EU.
          </span>
        </div>
        <SliderToggle
          size="xs"
          selected={workspace.regionalModelsOnly}
          disabled={isUpdatingWorkspaceRegionalModelsOnly}
          onClick={() => {
            void updateWorkspaceRegionalModelsOnly(
              !workspace.regionalModelsOnly
            );
          }}
        />
      </div>
    </div>
  );
}
