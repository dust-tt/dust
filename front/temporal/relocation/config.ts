import type { CellType } from "@app/types/cell";
import { SUPPORTED_CELLS } from "@app/types/cell";

// Bumped when the queue layout changes: a workflow started on one version never
// meets a worker on another.
const QUEUE_VERSION = 2;

// One task queue per cell. Source and destination activities are routed by cell,
// so two cells in the same region never pick up each other's work.
export const RELOCATION_QUEUES_PER_CELL: Record<CellType, string> =
  Object.fromEntries(
    SUPPORTED_CELLS.map((cell) => [
      cell,
      `relocation-queue-${cell}-v${QUEUE_VERSION}`,
    ])
  ) as Record<CellType, string>;
