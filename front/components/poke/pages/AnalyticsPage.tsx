import { PokeConsumptionPreview } from "@app/components/poke/analytics/PokeConsumptionPreview";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import { LinkWrapper } from "@dust-tt/sparkle";

export function AnalyticsPage() {
  const owner = useWorkspace();
  usePokePageMetadata({ name: owner.name, subtitle: "Analytics" });

  return (
    <main className="mx-auto w-full max-w-7xl">
      <h1 className="text-2xl font-bold">
        Analytics for workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Poke uses workspace-admin visibility, so resolved labels may differ from
        a customer manager&apos;s view.
      </p>
      <div className="min-w-0 py-6">
        <PokeConsumptionPreview owner={owner} />
      </div>
    </main>
  );
}
