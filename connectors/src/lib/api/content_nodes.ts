import type { Result } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import { zip } from "fp-ts/lib/Array";

import { getConnectorManager } from "@connectors/connectors";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import type { ConnectorResource } from "@connectors/resources/connector_resource";

export interface ContentNodeParentIdsBlob {
  internalId: string;
  parentInternalIds: string[];

  // TODO(2024-08-28 flav) Remove once front has been updated to use `parentInternalIds`.
  parents: string[];
}

export async function getParentIdsForContentNodes(
  connector: ConnectorResource,
  internalIds: string[]
): Promise<Result<ContentNodeParentIdsBlob[], Error>> {
  const connectorManager = getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  });

  const parentsResults = await concurrentExecutor(
    internalIds,
    (internalId) => connectorManager.retrieveContentNodeParents({ internalId }),
    { concurrency: 10 }
  );

  const nodes: ContentNodeParentIdsBlob[] = [];

  for (const [internalId, parentsResult] of zip(internalIds, parentsResults)) {
    if (parentsResult.isErr()) {
      return parentsResult;
    }

    nodes.push({
      internalId,
      parentInternalIds: parentsResult.value,

      // TODO(2024-08-28 flav) Remove once front has been updated to use `parentInternalIds`.
      parents: parentsResult.value,
    });
  }

  return new Ok(nodes);
}
