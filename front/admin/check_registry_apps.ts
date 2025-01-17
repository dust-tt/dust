import { DustAPI } from "@dust-tt/client";
import parseArgs from "minimist";

import config from "@app/lib/api/config";
import { BaseDustProdActionRegistry } from "@app/lib/registry";
import logger from "@app/logger/logger";

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  if (!argv.url) {
    throw new Error("Missing --url argument");
  }
  if (!argv.wId) {
    throw new Error("Missing --wId argument");
  }
  if (!argv.spaceId) {
    throw new Error("Missing --spaceId argument");
  }
  const api = new DustAPI(
    config.getDustAPIConfig(),
    { apiKey: argv.apiKey, workspaceId: argv.wId },
    logger,
    argv.url
  );

  const actions = Object.values(BaseDustProdActionRegistry);

  const res = await api.checkApps(
    {
      apps: actions.map((action) => ({
        appId: action.app.appId,
        appHash: action.app.appHash,
      })),
    },
    argv.spaceId
  );
  if (res.isErr()) {
    throw new Error(res.error.message);
  }
  const notDeployedApps = res.value.filter((a) => !a.deployed);
  if (notDeployedApps.length > 0) {
    throw new Error(
      "Missing apps: " + notDeployedApps.map((a) => a.appId).join(", ")
    );
  }
  console.log("All apps are deployed");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
