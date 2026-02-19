import { PORT_OFFSETS } from "./ports";

export const FORWARDER_MAPPINGS = [
  { listenPort: 3000, targetOffset: PORT_OFFSETS.front, name: "front" },
  { listenPort: 3001, targetOffset: PORT_OFFSETS.core, name: "core" },
  { listenPort: 3002, targetOffset: PORT_OFFSETS.connectors, name: "connectors" },
  { listenPort: 3006, targetOffset: PORT_OFFSETS.oauth, name: "oauth" },
  { listenPort: 3010, targetOffset: PORT_OFFSETS.frontSpaPoke, name: "front-spa-poke" },
  { listenPort: 3011, targetOffset: PORT_OFFSETS.frontSpaApp, name: "front-spa-app" },
] as const;

export const FORWARDER_PORTS = FORWARDER_MAPPINGS.map((mapping) => mapping.listenPort);
