import * as t from "io-ts";

// Define the base message event structure.
export const MessageEventCodec = t.type({
  type: t.string,
  data: t.unknown, // Will be refined by specific message codecs.
});

// Export request message codecs
export const ExportPngMessageCodec = t.type({
  type: t.literal("EXPORT_PNG"),
});

export const ExportSvgMessageCodec = t.type({
  type: t.literal("EXPORT_SVG"),
});

// Union of all supported message types coming from the parent window.
export const SupportedMessageCodec = t.union([
  ExportPngMessageCodec,
  ExportSvgMessageCodec,
]);

// Type definitions derived from codecs.
export type MessageEvent = t.TypeOf<typeof MessageEventCodec>;
export type ExportPngMessage = t.TypeOf<typeof ExportPngMessageCodec>;
export type ExportSvgMessage = t.TypeOf<typeof ExportSvgMessageCodec>;
export type SupportedMessage = t.TypeOf<typeof SupportedMessageCodec>;

// Extract valid event types from our supported messages.
export type SupportedEventType = SupportedMessage["type"];

// Validation helper functions
export const isValidMessage = (data: unknown): data is SupportedMessage => {
  return SupportedMessageCodec.is(data);
};

export const validateMessage = (data: unknown): SupportedMessage | null => {
  const result = SupportedMessageCodec.decode(data);
  return result._tag === "Right" ? result.right : null;
};
