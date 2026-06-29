import { StaticTokenVerifier } from "./auth";
import { createProvider } from "./blaxel";
import { loadConfig } from "./config";
import { ControlPlane } from "./control-plane";
import { handleRequest } from "./router";
import { FileBeeStore } from "./store";

const config = loadConfig();

const cp = new ControlPlane({
  store: new FileBeeStore(config.beesFilePath),
  provider: createProvider(config),
  region: config.region,
});

const verifier = new StaticTokenVerifier(config.devTokens);

const server = Bun.serve({
  port: config.port,
  fetch: (req) => handleRequest(cp, verifier, req),
});

console.log(
  `Hive control plane listening on http://localhost:${server.port} (provider: ${config.provider})`
);
