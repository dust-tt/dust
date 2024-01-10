import { ModelId } from "@dust-tt/types";

import { getBotEnabled } from "@connectors/connectors/slack/bot";
import { Connector } from "@connectors/lib/models";
import { Err } from "@connectors/lib/result.js";

export async function getSlackConfig(connectorId: ModelId, configKey: string) {
  const connector = await Connector.findOne({
    where: { id: connectorId },
  });
  if (!connector) {
    return new Err(new Error(`Connector not found with id ${connectorId}`));
  }

  switch (configKey) {
    case "botEnabled": {
      return getBotEnabled(connectorId);
    }
    default:
      return new Err(new Error(`Invalid config key ${configKey}`));
  }
}
