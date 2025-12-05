import type { Warehouse } from "./types";

export function renderWarehouse(warehouse: Warehouse): string {
  let text = `- **${warehouse.name}** (ID: ${warehouse.id})`;
  text += `\n  - State: ${warehouse.state}`;
  text += `\n  - Cluster Size: ${warehouse.cluster_size}`;
  text += `\n  - Auto Stop: ${warehouse.auto_stop_mins} minutes`;
  if (warehouse.enable_photon) {
    text += `\n  - Photon: Enabled`;
  }
  return text;
}
