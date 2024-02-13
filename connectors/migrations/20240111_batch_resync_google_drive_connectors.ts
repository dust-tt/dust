import type { ModelId, Result } from "@dust-tt/types";
import parseArgs from "minimist";
import readline from "readline";

import { SYNC_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { sequelizeConnection } from "@connectors/resources/storage";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const { size, batchNumber, batchSize } = argv;

  if (!size || !["small", "large"].includes(size)) {
    throw new Error("size must be small or large");
  }

  if (batchNumber === undefined || batchNumber < 0) {
    throw new Error("batchNumber must be positive");
  }

  const queryRes = await sequelizeConnection.query(`
    SELECT COUNT(*) c, "connectorId"
    FROM google_drive_files
    WHERE "connectorId" IS NOT NULL
    GROUP BY "connectorId"
    ORDER BY "connectorId" ASC`);

  const connectorIdsWithCount = queryRes[0] as {
    c: number;
    connectorId: ModelId;
  }[];

  const filter = (c: number) => {
    if (size === "small") {
      return c <= 10_000;
    }

    if (size === "large") {
      return c > 10_000;
    }
  };

  const connectorIds = connectorIdsWithCount
    .filter((c) => filter(c.c))
    .map((c) => c.connectorId);

  let connectorsToResync = [];

  if (batchSize) {
    const start = batchNumber * batchSize;
    const end = start + batchSize;
    const batchesRemaining = Math.ceil((connectorIds.length - end) / batchSize);
    console.log(
      `Resyncing batch ${batchNumber} of size ${batchSize} (from ${start} to ${end}). ${batchesRemaining} batches remaining.`
    );
    connectorsToResync = connectorIds.slice(start, end);
  } else {
    console.log(`Resyncing ${connectorIds.length} connectors`);
    connectorsToResync = connectorIds;
  }

  console.log("Connectors to resync:", connectorsToResync);

  const answer: string = await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      "Are you sure you want to trigger full sync" +
        ` for ${connectorsToResync.length} Notion connectors ? (y/N) `,
      (answer) => {
        rl.close();
        resolve(answer);
      }
    );
  });

  if (answer !== "y") {
    console.log("Cancelled");
    return;
  }

  for (const connectorId of connectorsToResync) {
    await throwOnError(
      SYNC_CONNECTOR_BY_TYPE["google_drive"](connectorId, null)
    );
  }

  return;
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });

async function throwOnError<T>(p: Promise<Result<T, Error>>) {
  const res = await p;
  if (res.isErr()) {
    throw res.error;
  }
  return res;
}
