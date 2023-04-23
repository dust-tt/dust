import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import { ClientRouterInterface } from "@app/../t3/src/router.js";

const {CONNECTORS_TRPC_URL} = process.env;

if (!CONNECTORS_TRPC_URL) {
  throw new Error("CONNECTORS_TRPC_URL is not defined");
}

// Connection to the server is not established until the first request is made.
// And it's going through HTTP anyway so apart from keepAlive stuff, it's not a 
// permanent connection.
const trpc = createTRPCProxyClient<ClientRouterInterface>({
    links: [
      httpBatchLink({
        url: CONNECTORS_TRPC_URL
      }),
    ],
  });

export const connectorsClient = trpc;