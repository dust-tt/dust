import { createHTTPServer } from "@trpc/server/adapters/standalone";

import { serverRouter } from "./router.js";

const server = createHTTPServer({
  router: serverRouter,
});
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;

console.log(`serving client on port ${port}`);
server.listen(port);
