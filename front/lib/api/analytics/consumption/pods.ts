import { SPACE_ID_FIELD } from "@app/lib/api/analytics/consumption/scope";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { estypes } from "@elastic/elasticsearch";

/**
 * @cc [owner:rfrenoy,label:product] pod-dimension-project-spaces-only
 * Conversations can belong to non-project spaces, so `space_id` is not always a pod. Rankings,
 * breakdowns and facets of the pod dimension MUST apply this filter so they only key on project
 * spaces the caller can fetch, deleted ones included: no series, row or facet MUST be keyed on any
 * other space, and a caller who can fetch no pod gets none. Unkeyed totals, such as the timeseries
 * fallback when no pod has usage, are not restricted.
 */
export async function buildPodSpaceFilter(
  auth: Authenticator
): Promise<estypes.QueryDslQueryContainer> {
  const pods = await SpaceResource.listAccessibleProjectSpaces(auth, {
    includeDeleted: true,
  });
  if (pods.length === 0) {
    return { match_none: {} };
  }
  return { terms: { [SPACE_ID_FIELD]: pods.map((pod) => pod.sId) } };
}
