import { z } from "zod";

export const ZendeskAdditionalDataSchema = z.object({});

export type ZendeskAdditionalData = z.infer<typeof ZendeskAdditionalDataSchema>;
