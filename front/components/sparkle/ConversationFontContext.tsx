import {
  applyDocumentAttribute,
  buildPreferenceInitScript,
  PreferenceInitScript,
  usePersistedUserPreference,
} from "@app/components/sparkle/persistedUserPreference";
import { createContext, useContext, useMemo } from "react";

/**
 * Font used for agent answers in conversations (Settings > Customization).
 * User messages and thinking blocks keep the app font.
 * - `sans`: Geist, the app font (default).
 * - `serif`: Lora.
 * - `dyslexic`: OpenDyslexic.
 *
 * Stored as user metadata, mirrored in localStorage, and applied as
 * `data-conversation-font` on <html>; only elements using the
 * `font-conversation` utility react to it (see persistedUserPreference).
 */
export const CONVERSATION_FONTS = ["sans", "serif", "dyslexic"] as const;
export type ConversationFont = (typeof CONVERSATION_FONTS)[number];

export const CONVERSATION_FONT_LABELS: Record<ConversationFont, string> = {
  sans: "Default",
  serif: "Lora",
  dyslexic: "OpenDyslexic",
};

const DEFAULT_CONVERSATION_FONT: ConversationFont = "sans";
export const CONVERSATION_FONT_METADATA_KEY = "conversation_font";
const STORAGE_KEY = "conversationFont";
const DATA_ATTRIBUTE = "data-conversation-font";

export function isConversationFont(
  value: string | null | undefined
): value is ConversationFont {
  return (
    typeof value === "string" &&
    CONVERSATION_FONTS.some((font) => font === value)
  );
}

export function applyConversationFont(font: ConversationFont): void {
  applyDocumentAttribute(DATA_ATTRIBUTE, font, DEFAULT_CONVERSATION_FONT);
}

const initScript = buildPreferenceInitScript({
  storageKey: STORAGE_KEY,
  attribute: DATA_ATTRIBUTE,
  values: CONVERSATION_FONTS.filter((f) => f !== DEFAULT_CONVERSATION_FONT),
});

interface ConversationFontContextType {
  conversationFont: ConversationFont;
  // Resolves to false when the server save failed (the font still applies
  // locally); callers surface that to the user.
  setConversationFont: (font: ConversationFont) => Promise<boolean>;
}

const ConversationFontContext = createContext<
  ConversationFontContextType | undefined
>(undefined);

export function ConversationFontProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { value, setValue } = usePersistedUserPreference<ConversationFont>({
    metadataKey: CONVERSATION_FONT_METADATA_KEY,
    storageKey: STORAGE_KEY,
    defaultValue: DEFAULT_CONVERSATION_FONT,
    isValid: isConversationFont,
    apply: applyConversationFont,
    label: "conversation font",
  });

  const contextValue = useMemo(
    () => ({ conversationFont: value, setConversationFont: setValue }),
    [value, setValue]
  );

  return (
    <ConversationFontContext.Provider value={contextValue}>
      <PreferenceInitScript script={initScript} />
      {children}
    </ConversationFontContext.Provider>
  );
}

export const useConversationFont = () => {
  const context = useContext(ConversationFontContext);
  if (!context) {
    throw new Error(
      "useConversationFont must be used within ConversationFontProvider"
    );
  }
  return context;
};
