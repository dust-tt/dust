import { z } from "zod";

// Define the base message event structure.
export const MessageEventSchema = z.object({
  type: z.string(),
  data: z.unknown().optional(), // Will be refined by specific message schemas.
});

// Export request message schemas
export const ExportPngMessageSchema = z.object({
  type: z.literal("EXPORT_PNG"),
});

export const ExportSvgMessageSchema = z.object({
  type: z.literal("EXPORT_SVG"),
});

// Union of all supported message types coming from the parent window.
export const SupportedMessageSchema = z.union([
  ExportPngMessageSchema,
  ExportSvgMessageSchema,
]);

// Type definitions derived from schemas.
export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type SupportedMessage = z.infer<typeof SupportedMessageSchema>;

// Extract valid event types from our supported messages.
export type SupportedEventType = SupportedMessage["type"];

export const validateMessage = (data: unknown): SupportedMessage | null => {
  const result = SupportedMessageSchema.safeParse(data);

  return result.success ? result.data : null;
};
