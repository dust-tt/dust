import { z } from "zod";

export const WarehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  cluster_size: z.string(),
  auto_stop_mins: z.number(),
  enable_photon: z.boolean(),
  enable_serverless_compute: z.boolean(),
  state: z.string(),
});
export type Warehouse = z.infer<typeof WarehouseSchema>;
