import { SUPPORTED_REGIONS } from "@app/types/region";

// Cells are standalone deployments of a whole Dust environment.
export const SUPPORTED_CELLS = ["cell-00000", "cell-00001"] as const;
export type CellType = (typeof SUPPORTED_CELLS)[number];

import { z } from "zod";

export const CellInfoSchema = z.object({
  name: z.enum(SUPPORTED_CELLS),
  region: z.enum(SUPPORTED_REGIONS),
  url: z.string().url(),
});

export type CellInfo = z.infer<typeof CellInfoSchema>;

export function isCellType(cell: string): cell is CellType {
  return SUPPORTED_CELLS.includes(cell as CellType);
}
