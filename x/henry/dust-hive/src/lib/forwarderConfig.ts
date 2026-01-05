import { PORT_OFFSETS } from "./ports";

export const FORWARDER_MAPPINGS = [
  { listenPort: 3000, targetOffset: PORT_OFFSETS.front, name: "front" },
  { listenPort: 3001, targetOffset: PORT_OFFSETS.core, name: "core" },
  { listenPort: 3002, targetOffset: PORT_OFFSETS.connectors, name: "connectors" },
  { listenPort: 3006, targetOffset: PORT_OFFSETS.oauth, name: "oauth" },
] as const;

export const FORWARDER_PORTS = FORWARDER_MAPPINGS.map((mapping) => mapping.listenPort);
