// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DustAPI } from "@dust-tt/client";

import config from "@app/lib/api/config";
import { BaseDustProdActionRegistry } from "@app/lib/registry";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

async function main({
  url,
  wId,
  spaceId,
  apiKey,
}: {
  url: string;
  wId: string;
  spaceId: string;
  apiKey: string;
}) {
  const api = new DustAPI(
    config.getDustAPIConfig(),
    { apiKey, workspaceId: wId },
    logger,
    url
  );

  const actions = Object.values(BaseDustProdActionRegistry);

  const res = await api.checkApps(
    {
      apps: actions.map((action) => ({
        appId: action.app.appId,
        appHash: action.app.appHash,
      })),
    },
    spaceId
  );
  if (res.isErr()) {
    throw new Error(res.error.message);
  }
  const notDeployedApps = res.value.filter((a) => !a.deployed);
  if (notDeployedApps.length > 0) {
    throw new Error(
      "Missing apps: " +
        notDeployedApps.map((a) => a.appId).join(", ") +
        "\n" +
        "Check runbook: https://www.notion.so/dust-tt/Runbook-Update-Assistant-dust-apps-18c28599d94180d78dabe92f445157a8"
    );
  }
  console.log("All apps are deployed");
}

makeScript(
  {
    url: { type: "string", required: true },
    wId: { type: "string", required: true },
    spaceId: { type: "string", required: true },
    apiKey: { type: "string", required: true },
  },
  async ({ url, wId, spaceId, apiKey, execute }) => {
    if (execute) {
      await main({ url, wId, spaceId, apiKey });
    }
  }
);
