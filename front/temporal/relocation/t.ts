import {
  isFileStorageTransferComplete,
  startTransferFrontPublicFiles,
} from "@app/temporal/relocation/activities/source_region/front";

async function main() {
  // return getTablesWithWorkspaceIdOrder();

  // const [a] = await frontSequelize.query(
  //   "SELECT * FROM datasets WHERE id = 2",
  //   {
  //     type: QueryTypes.SELECT,
  //   }
  // );

  // console.log(">> formatValue:", JSON.stringify(formatValue(a), null, 2));

  const transferResult = await startTransferFrontPublicFiles({
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
