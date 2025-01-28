import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import {
  isFileStorageTransferComplete,
  startTransferFrontFilesToDestinationRegion,
} from "@app/temporal/relocation/activities/source_region/front/file_storage";
import { formatValue } from "@app/temporal/relocation/sql_generator";

async function main() {
  // return getTablesWithWorkspaceIdOrder();

  // const [a] = await frontSequelize.query(
  //   "SELECT * FROM datasets WHERE id = 2",
  //   {
  //     type: QueryTypes.SELECT,
  //   }
  // );

  // console.log(">> formatValue:", JSON.stringify(formatValue(a), null, 2));

  const transferResult = await startTransferFrontFilesToDestinationRegion({
    sourceRegion: "us-central1",
    destRegion: "europe-west1",
    workspaceId: "AgtPVuhCPc",
  });

  if (transferResult.isErr()) {
    console.error(transferResult.error);
    return;
  }

  while (true) {
    const isDone = await isFileStorageTransferComplete({
      jobName: transferResult.value,
    });

    if (isDone) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

main()
  .then(() => console.log("Done"))
  .catch(console.error);
