import type {
  ContentNode,
  ContentNodeWithParentIds,
  Result,
} from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import { hash as blake3 } from "blake3";
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

  const memoizationKey = `content-node-parents-${connector.id}-${blake3(internalIds.join("-"), { length: 256 }).toString()}`;

  const parentsResults = await concurrentExecutor(
    internalIds,
    (internalId) =>
      connectorManager.retrieveContentNodeParents({
        internalId,
        memoizationKey,
      }),
    { concurrency: 30 }
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

export async function augmentContentNodesWithParentIds(
  connector: ConnectorResource,
  contentNodes: ContentNode[]
): Promise<Promise<Result<ContentNodeWithParentIds[], Error>>> {
  const internalIds = contentNodes.map((node) => node.internalId);

  const parentsRes = await getParentIdsForContentNodes(connector, internalIds);
  if (parentsRes.isErr()) {
    return parentsRes;
  }

  const nodesWithParentIds: ContentNodeWithParentIds[] = [];

  for (const { internalId, parentInternalIds } of parentsRes.value) {
    const node = contentNodes.find((n) => n.internalId === internalId);

    if (node) {
      nodesWithParentIds.push({
        ...node,
        parentInternalIds,
      });
    }
  }

  return new Ok(nodesWithParentIds);
}
