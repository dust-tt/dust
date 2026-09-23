import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Font used for agent answers in conversations (Settings > Customization).
 * User messages and thinking blocks keep the app font.
 * - `sans`: Geist, the app font (default).
 * - `serif`: Lora.
 * - `dyslexic`: OpenDyslexic.
 *
 * The preference is stored as user metadata so it follows the user across
 * devices, and mirrored in localStorage so the first paint already uses it
 * (see `ConversationFontScript`). It is applied as `data-conversation-font`
 * on <html>; only elements using the `font-conversation` utility react to it.
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

function getStoredConversationFont(): ConversationFont {
  if (typeof window === "undefined") {
    return DEFAULT_CONVERSATION_FONT;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isConversationFont(stored) ? stored : DEFAULT_CONVERSATION_FONT;
  } catch {
    return DEFAULT_CONVERSATION_FONT;
  }
}

export function applyConversationFont(font: ConversationFont): void {
  if (typeof document === "undefined") {
    return;
  }
  if (font === DEFAULT_CONVERSATION_FONT) {
    document.documentElement.removeAttribute(DATA_ATTRIBUTE);
  } else {
    document.documentElement.setAttribute(DATA_ATTRIBUTE, font);
  }
}

interface ConversationFontContextType {
  conversationFont: ConversationFont;
  // Resolves to false when the server save failed (the font still applies
  // locally); callers surface that to the user.
  setConversationFont: (font: ConversationFont) => Promise<boolean>;
}

export const ConversationFontContext = createContext<
  ConversationFontContextType | undefined
>(undefined);

// Runs before React hydration so the first paint already uses the stored
// font, like ThemeScript does for dark mode. Must not reference module scope.
const minifiedConversationFontScript = `function(){try{const f=localStorage.getItem("conversationFont");if(f==="serif"||f==="dyslexic"){document.documentElement.setAttribute("data-conversation-font",f)}}catch(e){}}`;

const ConversationFontScript = memo(function ConversationFontInitScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(${minifiedConversationFontScript})()`,
      }}
    />
  );
});

/**
 * @cc [owner:ykmsd,label:react] authenticated-mount-only
 * The metadata fetch here uses the redirecting fetcher: a 401 navigates the
 * visitor to the WorkOS sign-in page. This provider MUST only be mounted
 * behind an authentication gate, never on routes anonymous
 * visitors can reach (e.g. `/w/:wId/join`, `/login-error`) — mounting it
 * globally bounced every invitation-link visitor to the sign-up page.
 */
export function ConversationFontProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [conversationFont, setConversationFontState] =
    useState<ConversationFont>(() => getStoredConversationFont());

  // The server value wins over the local mirror whenever it changes (initial
  // load, or a choice made on another device). Adopting it during render with
  // the previous-value pattern, rather than in an effect, means a local change
  // never gets clobbered by a stale server value while its save is in flight.
  const { metadata, mutateMetadata } = useUserMetadata(
    CONVERSATION_FONT_METADATA_KEY
  );
  const serverFont = metadata?.value;
  // Starts undefined (not `serverFont`) so a value already present on the
  // first render, e.g. from the SWR cache, is adopted as well.
  const [prevServerFont, setPrevServerFont] = useState<string | undefined>(
    undefined
  );
  if (serverFont !== prevServerFont) {
    setPrevServerFont(serverFont);
    if (isConversationFont(serverFont)) {
      setConversationFontState(serverFont);
    }
  }

  // Sync the external systems (the <html> attribute and the localStorage
  // mirror read by the pre-hydration script) from the current value.
  useEffect(() => {
    applyConversationFont(conversationFont);
    try {
      localStorage.setItem(STORAGE_KEY, conversationFont);
    } catch {
      // Storage may be unavailable (private mode); the attribute still applies.
    }
  }, [conversationFont]);

  const setConversationFont = useCallback(
    async (font: ConversationFont) => {
      setConversationFontState(font);

      try {
        await setUserMetadataFromClient({
          key: CONVERSATION_FONT_METADATA_KEY,
          value: font,
        });
      } catch (err) {
        // The local choice still applies; it just won't follow the user to
        // other devices until the next successful save.
        logger.error(
          { font, err: normalizeError(err) },
          "Failed to save conversation font preference"
        );
        return false;
      }

      await mutateMetadata(
        { metadata: { key: CONVERSATION_FONT_METADATA_KEY, value: font } },
        { revalidate: false }
      );
      return true;
    },
    [mutateMetadata]
  );

  const value = useMemo(
    () => ({ conversationFont, setConversationFont }),
    [conversationFont, setConversationFont]
  );

  return (
    <ConversationFontContext.Provider value={value}>
      <ConversationFontScript />
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
