import minimist from "minimist";

import { startServer } from "@connectors/api_server";

const argv = minimist(process.argv.slice(2));
if (!argv.p) {
  throw new Error("Port is required: -p <port>");
}
const port = argv.p;

startServer(port);
