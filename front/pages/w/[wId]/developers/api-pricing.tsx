import { Button, CardIcon, Page, SearchInput } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import {
  DUST_MARKUP_PERCENT,
  MODEL_PRICING,
} from "@app/lib/api/assistant/token_pricing";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import {
  getProviderDisplayName,
  MODEL_PROVIDER_IDS,
} from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";

const ALL_PROVIDERS_LABEL = "All";

// Build a map from modelId to displayName and providerId.
const modelConfigMap = new Map<
  string,
  { displayName: string; providerId: ModelProviderIdType }
>(
  SUPPORTED_MODEL_CONFIGS.map((config) => [
    config.modelId,
    { displayName: config.displayName, providerId: config.providerId },
  ])
);

interface PricingRow {
  modelId: string;
  displayName: string;
  providerId: ModelProviderIdType;
  providerDisplayName: string;
  inputPrice: number;
  outputPrice: number;
  cacheReadPrice: number | null;
  cacheWritePrice: number | null;
}

function applyMarkup(price: number): number {
  return price * (1 + DUST_MARKUP_PERCENT / 100);
}

function formatPrice(price: number): string {
  if (price === 0) {
    return "Free";
  }
  // Price is in USD per million tokens.
  // Show with 2-4 decimal places depending on magnitude.
  if (price < 0.01) {
    return `$${price.toFixed(4)}`;
  }
  if (price < 1) {
    return `$${price.toFixed(3)}`;
  }
  return `$${price.toFixed(2)}`;
}

function buildPricingData(): PricingRow[] {
  const rows: PricingRow[] = [];

  for (const [modelId, pricing] of Object.entries(MODEL_PRICING)) {
    const config = modelConfigMap.get(modelId);
    // Only include models that are in SUPPORTED_MODEL_CONFIGS (current models).
    if (!config) {
      continue;
    }
    // Skip noop model.
    if (config.providerId === "noop") {
      continue;
    }

    rows.push({
      modelId,
      displayName: config.displayName,
      providerId: config.providerId,
      providerDisplayName: getProviderDisplayName(config.providerId),
      inputPrice: applyMarkup(pricing.input),
      outputPrice: applyMarkup(pricing.output),
      cacheReadPrice: pricing.cache_read_input_tokens
        ? applyMarkup(pricing.cache_read_input_tokens)
        : null,
      cacheWritePrice: pricing.cache_creation_input_tokens
        ? applyMarkup(pricing.cache_creation_input_tokens)
        : null,
    });
  }

  // Sort by provider, then by display name.
  rows.sort((a, b) => {
    if (a.providerDisplayName !== b.providerDisplayName) {
      return a.providerDisplayName.localeCompare(b.providerDisplayName);
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return rows;
}

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (_context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isAdmin()) {
    return { notFound: true };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

interface PricingTableProps {
  rows: PricingRow[];
}

function PricingTable({ rows }: PricingTableProps) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground dark:text-muted-foreground-night">
        No models found matching your criteria.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border dark:border-border-night">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/30 dark:border-border-night dark:bg-muted-night/30">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground-night">
              Model
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground-night">
              Provider
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground-night">
              Input
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground-night">
              Output
            </th>
            <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground-night md:table-cell">
              Cache Read
            </th>
            <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground dark:text-muted-foreground-night lg:table-cell">
              Cache Write
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border dark:divide-border-night">
          {rows.map((row) => (
            <tr
              key={row.modelId}
              className="transition-colors hover:bg-muted/20 dark:hover:bg-muted-night/20"
            >
              <td className="px-4 py-3">
                <span className="font-medium text-foreground dark:text-foreground-night">
                  {row.displayName}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {row.providerDisplayName}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                  {formatPrice(row.inputPrice)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="font-mono text-sm text-foreground dark:text-foreground-night">
                  {formatPrice(row.outputPrice)}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-right md:table-cell">
                <span className="font-mono text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {row.cacheReadPrice ? formatPrice(row.cacheReadPrice) : "—"}
                </span>
              </td>
              <td className="hidden px-4 py-3 text-right lg:table-cell">
                <span className="font-mono text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {row.cacheWritePrice ? formatPrice(row.cacheWritePrice) : "—"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ApiPricingPage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const [selectedProvider, setSelectedProvider] =
    useState<string>(ALL_PROVIDERS_LABEL);
  const [searchQuery, setSearchQuery] = useState("");

  const allPricingData = useMemo(() => buildPricingData(), []);

  // Get unique providers from current models.
  const providers = useMemo(() => {
    const providerSet = new Set(allPricingData.map((row) => row.providerId));
    return MODEL_PROVIDER_IDS.filter(
      (id) => id !== "noop" && providerSet.has(id)
    ).map((id) => ({
      id,
      label: getProviderDisplayName(id),
    }));
  }, [allPricingData]);

  const filteredData = useMemo(() => {
    return allPricingData.filter((row) => {
      // Provider filter.
      if (
        selectedProvider !== ALL_PROVIDERS_LABEL &&
        row.providerDisplayName !== selectedProvider
      ) {
        return false;
      }
      // Search filter.
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          row.displayName.toLowerCase().includes(query) ||
          row.modelId.toLowerCase().includes(query) ||
          row.providerDisplayName.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [allPricingData, selectedProvider, searchQuery]);

  const providerFilters = [
    ALL_PROVIDERS_LABEL,
    ...providers.map((p) => p.label),
  ];

  return (
    <AppCenteredLayout
      owner={owner}
      subscription={subscription}
      subNavigation={subNavigationAdmin({
        owner,
        current: "credits_usage",
        featureFlags,
      })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="API Pricing"
          icon={CardIcon}
          description="Prices per million tokens. All prices are in USD."
        />

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {providerFilters.map((filter) => (
              <Button
                key={filter}
                label={filter}
                variant={selectedProvider === filter ? "primary" : "outline"}
                size="xs"
                onClick={() => setSelectedProvider(filter)}
              />
            ))}
          </div>
          <div className="w-full sm:w-64">
            <SearchInput
              name="model-search"
              placeholder="Search models..."
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Showing {filteredData.length} of {allPricingData.length} models
        </div>

        {/* Pricing Table */}
        <PricingTable rows={filteredData} />

        {/* Footer note */}
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground dark:border-border-night dark:bg-muted-night/20 dark:text-muted-foreground-night">
          <p>
            <strong>Note:</strong> Prices are subject to change. Cache pricing
            is available for models that support prompt caching. Input price
            applies to prompt tokens, output price applies to completion tokens.
          </p>
        </div>
      </Page.Vertical>
      <div className="h-12" />
    </AppCenteredLayout>
  );
}

ApiPricingPage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
