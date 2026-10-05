import { MemberModelTiersDataTable } from "@app/components/poke/model_tiers/table";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { usePokeMemberModelTiers } from "@app/poke/swr/model_tiers";
import { getModelsTierDisplayName } from "@app/types/assistant/models/model_tiers";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function ModelTiersPage() {
  const owner = useWorkspace();
  usePokePageMetadata({ name: owner.name, subtitle: "Model Tiers" });

  const {
    members,
    workspaceMaxTierName,
    isMemberModelTiersLoading,
    isMemberModelTiersError,
  } = usePokeMemberModelTiers({ owner, disabled: false });

  return (
    <main className="mx-auto w-full max-w-7xl">
      <h1 className="text-2xl font-bold">
        Model tiers for workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        A member's tier comes from their user override, else the highest
        override among their groups, else the workspace default.
        {workspaceMaxTierName &&
          ` Workspace default: ${getModelsTierDisplayName(workspaceMaxTierName)}.`}
      </p>
      <div className="min-w-0 py-6">
        {isMemberModelTiersLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        ) : isMemberModelTiersError ? (
          <div className="flex h-64 items-center justify-center">
            <p>Error loading model tiers.</p>
          </div>
        ) : (
          <MemberModelTiersDataTable members={members} owner={owner} />
        )}
      </div>
    </main>
  );
}
