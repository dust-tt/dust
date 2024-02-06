import type { ModelId, Result } from "@dust-tt/types";
import parseArgs from "minimist";
import readline from "readline";

import { SYNC_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { sequelize_conn } from "@connectors/lib/models";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  if (argv._.length < 3) {
    throw new Error(
      "Expects size, batchNumber, batchSize as argument, eg: `cli medium 0 10`"
    );
  }

  const [size, batchNumberStr, batchSizeStr] = argv._;

  if (!size || !["small", "medium", "large"].includes(size)) {
    throw new Error("size must be small, medium or large");
  }

  if (!batchNumberStr || !batchSizeStr) {
    throw new Error("batchNumber and batchSize are required");
  }

  const batchNumber = parseInt(batchNumberStr, 10);
  const batchSize = parseInt(batchSizeStr, 10);

  if (isNaN(batchNumber) || isNaN(batchSize)) {
    throw new Error("batchNumber and batchSize must be numbers");
  }

  if (batchNumber < 0) {
    throw new Error("batchNumber must be positive");
  }

  const queryRes = await sequelize_conn.query(`
    SELECT COUNT(*) c, "connectorId"
    FROM notion_pages
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

    if (size === "medium") {
      return c > 10_000 && c <= 60_000;
    }

    if (size === "large") {
      return c > 60_000;
    }
  };

  const connectorIds = connectorIdsWithCount
    .filter((c) => filter(c.c))
    .map((c) => c.connectorId);

  let connectorsToResync = [];

  if (batchSize !== -1) {
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
    await throwOnError(SYNC_CONNECTOR_BY_TYPE["notion"](connectorId, null));
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
