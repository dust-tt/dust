import { createPlugin } from "@app/lib/api/poke/types";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import {
  invalidateDustStatusCacheForRegion,
  invalidateProviderStatusCacheForRegion,
} from "@app/lib/api/status";
import { Ok } from "@app/types/shared/result";

export const invalidateStatuspageCachePlugin = createPlugin({
  manifest: {
    id: "invalidate-statuspage-cache",
    name: "Invalidate StatusPage Cache",
    description:
      "Invalidate the StatusPage incidents cache for both providers and dust status in all regions. " +
      "Use this when StatusPage incidents are updated and need to be reflected immediately.",
    resourceTypes: ["global"],
    args: {},
  },
  execute: async (_auth, _resource, _args) => {
    const results: string[] = [];
    const errors: string[] = [];

    for (const region of SUPPORTED_REGIONS) {
      try {
        await invalidateProviderStatusCacheForRegion(region);
        results.push(`✓ Invalidated providers status cache for ${region}`);
      } catch (err) {
        errors.push(
          `✗ Failed to invalidate providers status cache for ${region}: ${err}`
        );
      }

      try {
        await invalidateDustStatusCacheForRegion(region);
        results.push(`✓ Invalidated dust status cache for ${region}`);
      } catch (err) {
        errors.push(
          `✗ Failed to invalidate dust status cache for ${region}: ${err}`
        );
      }
    }

    const output = [...results];
    if (errors.length > 0) {
      output.push("", "**Errors:**", ...errors);
    }

    return new Ok({
      display: "markdown",
      value: output.join("\n"),
    });
  },
});
