import { PORT_OFFSETS } from "./ports";

interface ForwarderMapping {
  listenPort: number;
  targetOffset: number;
  name: string;
  preserveExistingListener?: boolean;
}

export const FORWARDER_MAPPINGS: readonly ForwarderMapping[] = [
  { listenPort: 3000, targetOffset: PORT_OFFSETS.front, name: "proxy" },
  { listenPort: 3001, targetOffset: PORT_OFFSETS.core, name: "core" },
  { listenPort: 3002, targetOffset: PORT_OFFSETS.connectors, name: "connectors" },
  { listenPort: 3006, targetOffset: PORT_OFFSETS.oauth, name: "oauth" },
  { listenPort: 3007, targetOffset: PORT_OFFSETS.viz, name: "viz" },
  { listenPort: 3010, targetOffset: PORT_OFFSETS.frontSpaPoke, name: "front-spa-poke" },
  { listenPort: 3011, targetOffset: PORT_OFFSETS.frontSpaApp, name: "front-spa-app" },
  {
    listenPort: 6006,
    targetOffset: PORT_OFFSETS.storybook,
    name: "storybook",
    preserveExistingListener: true,
  },
];

export const FORWARDER_PORTS = FORWARDER_MAPPINGS.map((mapping) => mapping.listenPort);

export function partitionOccupiedForwarderPorts(occupiedPorts: readonly number[]): {
  portsToClear: number[];
  portsToPreserve: number[];
} {
  const occupied = new Set(occupiedPorts);
  const occupiedMappings = FORWARDER_MAPPINGS.filter((mapping) => occupied.has(mapping.listenPort));

  return {
    portsToClear: occupiedMappings
      .filter((mapping) => !mapping.preserveExistingListener)
      .map((mapping) => mapping.listenPort),
    portsToPreserve: occupiedMappings
      .filter((mapping) => mapping.preserveExistingListener)
      .map((mapping) => mapping.listenPort),
  };
}
