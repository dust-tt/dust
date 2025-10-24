import { z } from "zod";

export const HubspotAdditionalDataSchema = z.object({
  appId: z.string().describe("The HubSpot app ID"),
});

export type HubspotAdditionalData = z.infer<typeof HubspotAdditionalDataSchema>;
