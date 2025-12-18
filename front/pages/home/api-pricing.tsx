import { Button, SearchInput } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import React, { useMemo, useState } from "react";

import { HeaderContentBlock } from "@app/components/home/ContentBlocks";
import { Grid } from "@app/components/home/ContentComponents";
import type { LandingLayoutProps } from "@app/components/home/LandingLayout";
import LandingLayout from "@app/components/home/LandingLayout";
import { PageMetadata } from "@app/components/home/PageMetadata";
import {
  DUST_MARKUP_PERCENT,
  MODEL_PRICING,
} from "@app/lib/api/assistant/token_pricing";
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

export async function getStaticProps() {
  return {
    props: {
      gtmTrackingId: process.env.NEXT_PUBLIC_GTM_TRACKING_ID ?? null,
    },
  };
}

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

export default function ApiPricingPage() {
  const router = useRouter();
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
    <>
      <PageMetadata
        title="Dust API Pricing: Model Costs for Programmatic Usage"
        description="Explore Dust API pricing for all supported AI models. View input and output token costs, cache pricing, and compare providers."
        pathname={router.asPath}
      />
      <HeaderContentBlock
        title="API Pricing"
        hasCTA={false}
        subtitle="Prices per million tokens. All prices are in USD."
      />
      <Grid>
        <div className="col-span-12 flex flex-col gap-6 md:col-span-10 md:col-start-2">
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
              applies to prompt tokens, output price applies to completion
              tokens.
            </p>
          </div>
        </div>
      </Grid>
    </>
  );
}

ApiPricingPage.getLayout = (
  page: ReactElement,
  pageProps: LandingLayoutProps
) => {
  return <LandingLayout pageProps={pageProps}>{page}</LandingLayout>;
};
