import { makeColumnsForFeatureFlags } from "@app/components/poke/features/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { usePokeFeatureFlags } from "@app/lib/swr/poke";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";

interface FeatureFlagsDataTableProps {
  owner: WorkspaceType;
  whitelistableFeatures: WhitelistableFeature[];
}

function prepareFeatureFlagsForDisplay(
  workspaceFlags: { name: WhitelistableFeature; createdAt: string }[],
  whitelistableFeatures: WhitelistableFeature[]
) {
  return whitelistableFeatures.map((ff) => {
    const enabledFlag = workspaceFlags.find((f) => f.name === ff);

    return {
      name: ff,
      enabled: !!enabledFlag,
      enabledAt: enabledFlag?.createdAt || null,
    };
  });
}

export function FeatureFlagsDataTable({
  owner,
  whitelistableFeatures,
}: FeatureFlagsDataTableProps) {
  return (
    <PokeDataTableConditionalFetch
      header="Feature Flags"
      owner={owner}
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
