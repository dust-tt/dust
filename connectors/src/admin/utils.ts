import { strict as assert } from "assert";
import minimist from "minimist";

import {
  getAuthObject,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/activities";
import { Connector } from "@connectors/lib/models";

const helpText = `
  Usage: npx tsx admin/utils.ts gdrive-raw-content --connectorId [num] --fileId [str]

  --connectorId  The connector id
  --fileId       The file id
`;

async function main() {
  const args = minimist(process.argv);

  if (args.help) {
    console.log(helpText);
    process.exit(0);
  }
  // get last element of args._, which should be the command
  const command = args._[args._.length - 1];
  assert(command === "gdrive-raw-content", `Unknown command: ${helpText}`);
  const connectorId = args.connectorId;
  const fileId = args.fileId;
  console.log(`Checking gdrive file`);
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }
  const authCredentials = await getAuthObject(connector.connectionId);
  const drive = await getDriveClient(authCredentials);
  const res = await drive.files.export({
    fileId: fileId,
    mimeType: "text/plain",
  });
  console.log(res.status);
  console.log(typeof res.data);
  console.log(res.data);
}

void main();
