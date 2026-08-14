import { SOURCE_BY_PROGRAMMATIC_ORIGIN } from "@app/lib/api/analytics/source_labels";
import type { estypes } from "@elastic/elasticsearch";

// The consumption source, as the front-end knows it: `context_origin` with its
// programmatic origins folded into the surface they belong to. Computed at query
// time so it also applies to everything already indexed.
export const CONTEXT_ORIGIN_SOURCE_FIELD = "context_origin_source";

export const CONSUMPTION_RUNTIME_MAPPINGS: Record<
  string,
  estypes.MappingRuntimeField
> = {
  [CONTEXT_ORIGIN_SOURCE_FIELD]: {
    type: "keyword",
    script: {
      source: `
        if (doc['context_origin'].size() == 0) {
          return;
        }
        String origin = doc['context_origin'].value;
        String source = params.sources.get(origin);
        emit(source == null ? origin : source);
      `,
      params: { sources: SOURCE_BY_PROGRAMMATIC_ORIGIN },
    },
  },
};
