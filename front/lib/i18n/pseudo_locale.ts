import { isRecord, isString } from "@app/types/shared/utils/general";
import type { Messages } from "@lingui/core";
import pseudolocale from "pseudolocale";

type CompiledMessage = Exclude<Messages[string], string>;

type CompiledMessageToken = CompiledMessage[number];

const PSEUDOLOCALE_OPTIONS = { prepend: "", append: "", delimiter: "%&&&%" };

const CHOICE_FORMAT_TYPES = ["plural", "select", "selectordinal"];

function isChoiceFormat(format: unknown): format is Record<string, unknown> {
  return typeof format === "object" && format !== null && isRecord(format);
}

function pseudoLocalizeTokens(tokens: CompiledMessage): CompiledMessage {
  return tokens.map((token): CompiledMessageToken => {
    if (isString(token)) {
      return pseudolocale(token, PSEUDOLOCALE_OPTIONS);
    }
    const [name, type, format] = token;
    if (
      !type ||
      !CHOICE_FORMAT_TYPES.includes(type) ||
      !isChoiceFormat(format)
    ) {
      return token;
    }
    return [
      name,
      type,
      Object.fromEntries(
        Object.entries(format).map(([choice, choiceTokens]) => [
          choice,
          Array.isArray(choiceTokens)
            ? pseudoLocalizeTokens(choiceTokens)
            : choiceTokens,
        ])
      ),
    ];
  });
}

/**
 * @cc [owner:sfriquet,label:product] pseudo-messages-from-source
 * Every message MUST be returned accented and wrapped in `[` and `]`, so untranslated, clipped and
 * assembled text is visible. Placeholder names, formats, plural and select keys, `#` and component
 * tags such as `<0>` MUST be kept unchanged, so the message renders like its source.
 */
export function pseudoLocalizeMessages(messages: Messages): Messages {
  return Object.fromEntries(
    Object.entries(messages).map(([id, message]) => [
      id,
      [
        "[",
        ...pseudoLocalizeTokens(isString(message) ? [message] : message),
        "]",
      ],
    ])
  );
}
