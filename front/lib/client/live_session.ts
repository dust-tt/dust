import { rand } from "@app/lib/utils/seeded_random";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { z } from "zod";

// Sparkle's `-500` colors (`sparkle/src/styles/tokens.css`) in six-digit hex, the only format
// y-tiptap's carets accept: they reach other people's editors through awareness.
const CARET_COLORS = [
  "#1c91ff", // blue
  "#ff6900", // orange
  "#54b47d", // emerald
  "#8e51ff", // violet
  "#ec4987", // pink
  "#ffaa0d", // golden
];

/** A stable caret color per user, so others recognize them across sessions. */
export function liveCaretColor(userId: string): string {
  return CARET_COLORS[Math.floor(rand(userId)() * CARET_COLORS.length)];
}

/**
 * @cc [owner:PopDaph,label:product] live-stateless-messages
 * `listener` MUST be called with every stateless message of `provider` that `schema` accepts, in
 * the order received, and never after the returned function is called. Any other message MUST be
 * ignored.
 */
export function onStatelessMessage<T>(
  provider: HocuspocusProvider,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  listener: (message: T) => void
): () => void {
  const onStateless = ({ payload }: { payload: string }) => {
    const json = safeParseJSON(payload);
    const message = json.isOk() ? schema.safeParse(json.value) : null;
    if (message?.success) {
      listener(message.data);
    }
  };
  provider.on("stateless", onStateless);
  return () => {
    provider.off("stateless", onStateless);
  };
}
