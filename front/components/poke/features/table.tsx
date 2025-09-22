import { makeColumnsForFeatureFlags } from "@app/components/poke/features/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFeatureFlags } from "@app/lib/swr/poke";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";
import { removeNulls, WHITELISTABLE_FEATURES_CONFIG } from "@app/types";

interface FeatureFlagsDataTableProps {
  owner: WorkspaceType;
  whitelistableFeatures: WhitelistableFeature[];
  loadOnInit?: boolean;
}

function prepareFeatureFlagsForDisplay(
  workspaceFlags: { name: WhitelistableFeature; createdAt: string }[],
  whitelistableFeatures: WhitelistableFeature[]
) {
  return removeNulls(
    whitelistableFeatures.map((ff) => {
      const enabledFlag = workspaceFlags.find((f) => f.name === ff);
      const config = WHITELISTABLE_FEATURES_CONFIG[ff];

      if (!config) {
        return null;
      }

      return {
        name: ff,
        description: WHITELISTABLE_FEATURES_CONFIG[ff].description,
        stage: WHITELISTABLE_FEATURES_CONFIG[ff].stage,
        enabled: !!enabledFlag,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        enabledAt: enabledFlag?.createdAt || null,
      };
    })
  );
}

export function FeatureFlagsDataTable({
  owner,
  whitelistableFeatures,
  loadOnInit,
}: FeatureFlagsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Feature Flags"
      owner={owner}
      loadOnInit={loadOnInit}
      useSWRHook={usePokeFeatureFlags}
    >
      {(data) => (
        <PokeDataTable
          columns={makeColumnsForFeatureFlags()}
          data={prepareFeatureFlagsForDisplay(data, whitelistableFeatures)}
        />
      )}
    </PokeDataTableConditionalFetch>
  );
}
