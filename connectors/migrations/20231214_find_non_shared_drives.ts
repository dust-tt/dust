import {
  getAuthObject,
  getDriveClient,
  getGoogleDriveObject,
  objectIsInFolders,
} from "@connectors/connectors/google_drive/temporal/activities";
import { GoogleDriveFolders } from "@connectors/lib/models/google_drive";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

async function main() {
  const gDriveConnectors = await ConnectorModel.findAll({
    where: {
      type: "google_drive",
    },
  });

  const chunkSize = 8;
  const chunks = [];
  for (let i = 0; i < gDriveConnectors.length; i += chunkSize) {
    chunks.push(gDriveConnectors.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    if (!chunk) {
      continue;
    }
    await Promise.all(
      chunk.map(async (c) => {
        try {
          const authCredentials = await getAuthObject(c.connectionId);
          const drive = await getDriveClient(authCredentials);

          const myDriveRes = await drive.files.get({ fileId: "root" });
          if (myDriveRes.status !== 200) {
            throw new Error(
              `Error getting my drive. status_code: ${myDriveRes.status}. status_text: ${myDriveRes.statusText}`
            );
          }
          if (!myDriveRes.data.id) {
            throw new Error("My drive id is undefined");
          }
          const rootId = myDriveRes.data.id;

          const selectedFolders = await GoogleDriveFolders.findAll({
            where: {
              connectorId: c.id,
            },
          });

          for (const f of selectedFolders) {
            const gDriveObject = await getGoogleDriveObject(
              authCredentials,
              f.folderId
            );
            if (!gDriveObject) {
              console.log(`Folder not found: folderId=${f.folderId}`);
              continue;
            }
            const isInPersonalDrive = await objectIsInFolders(
              c.id,
              authCredentials,
              gDriveObject,
              [rootId],
              0
            );
            console.log(`. rootId=${rootId}`);
            if (isInPersonalDrive) {
              console.log(
                `InPersonalDrive: connectorId=${c.id} folderName=${gDriveObject.name} folderId=${f.folderId}`
              );
            }
          }
        } catch (e) {
          console.log("Got error", e);
        }
      })
    );
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
