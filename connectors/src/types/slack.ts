import { z } from "zod";

// Auto-read patterns.

const MAX_SLACK_AUTO_READ_PATTERN_LENGTH = 256;

type SlackAutoReadPatternGroup = {
  hasAlternation: boolean;
  hasQuantifier: boolean;
};

function readRegexQuantifier(pattern: string, index: number): number | null {
  const char = pattern[index];

  if (char === "*" || char === "+" || char === "?") {
    return index + 1;
  }

  if (char !== "{") {
    return null;
  }

  const match = pattern.slice(index).match(/^\{\d+(,\d*)?\}\??/);
  if (!match) {
    return null;
  }

  return index + match[0]!.length;
}

function isRegexQuantified(pattern: string, index: number): boolean {
  return readRegexQuantifier(pattern, index) !== null;
}

function markQuantifiedAtom(groups: SlackAutoReadPatternGroup[]) {
  const currentGroup = groups.at(-1);
  if (currentGroup) {
    currentGroup.hasQuantifier = true;
  }
}

export function getSlackAutoReadPatternValidationError(
  pattern: string
): string | null {
  if (pattern.length === 0) {
    return "Pattern must not be empty.";
  }

  if (pattern.length > MAX_SLACK_AUTO_READ_PATTERN_LENGTH) {
    return `Pattern must be at most ${MAX_SLACK_AUTO_READ_PATTERN_LENGTH} characters.`;
  }

  try {
    new RegExp(`^${pattern}$`);
  } catch {
    return "Pattern must be a valid regular expression.";
  }

  if (/\\(?:[1-9]|k<)/.test(pattern)) {
    return "Pattern must not contain backreferences.";
  }

  const groups: SlackAutoReadPatternGroup[] = [];

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];

    if (char === "\\") {
      i++;
      if (isRegexQuantified(pattern, i + 1)) {
        markQuantifiedAtom(groups);
        i = readRegexQuantifier(pattern, i + 1)! - 1;
      }
      continue;
    }

    if (char === "[") {
      i++;
      while (i < pattern.length) {
        if (pattern[i] === "\\") {
          i += 2;
          continue;
        }
        if (pattern[i] === "]") {
          break;
        }
        i++;
      }

      if (isRegexQuantified(pattern, i + 1)) {
        markQuantifiedAtom(groups);
        i = readRegexQuantifier(pattern, i + 1)! - 1;
      }
      continue;
    }

    if (char === "(") {
      if (pattern[i + 1] === "?") {
        if (pattern[i + 2] !== ":") {
          return "Pattern must not contain lookaround or other advanced group assertions.";
        }
        i += 2;
      }

      groups.push({ hasAlternation: false, hasQuantifier: false });
      continue;
    }

    if (char === ")") {
      const group = groups.pop();
      if (!group) {
        // The RegExp constructor above already validates this, but keep the
        // analyzer defensive if its assumptions ever change.
        return "Pattern must be a valid regular expression.";
      }

      if (isRegexQuantified(pattern, i + 1)) {
        if (group.hasQuantifier || group.hasAlternation) {
          return "Pattern must not contain quantified groups with nested quantifiers or alternation.";
        }

        markQuantifiedAtom(groups);
        i = readRegexQuantifier(pattern, i + 1)! - 1;
      }
      continue;
    }

    if (char === "|") {
      const currentGroup = groups.at(-1);
      if (currentGroup) {
        currentGroup.hasAlternation = true;
      }
      continue;
    }

    if (isRegexQuantified(pattern, i + 1)) {
      markQuantifiedAtom(groups);
      i = readRegexQuantifier(pattern, i + 1)! - 1;
    }
  }

  return null;
}

export function isValidSlackAutoReadPattern(pattern: string): boolean {
  return getSlackAutoReadPatternValidationError(pattern) === null;
}

export function makeSlackAutoReadPatternRegex(pattern: string): RegExp | null {
  if (!isValidSlackAutoReadPattern(pattern)) {
    return null;
  }

  return new RegExp(`^${pattern}$`);
}

const SlackAutoReadPatternSchema = z.object({
  pattern: z.string().refine(isValidSlackAutoReadPattern, {
    message:
      "Pattern must be a safe regular expression without ReDoS-prone constructs.",
  }),
  spaceId: z.string(),
});
export const SlackAutoReadPatternsSchema = z.array(SlackAutoReadPatternSchema);

export type SlackAutoReadPattern = z.infer<typeof SlackAutoReadPatternSchema>;

export function isSlackAutoReadPatterns(
  v: unknown[]
): v is SlackAutoReadPattern[] {
  const result = SlackAutoReadPatternsSchema.safeParse(v);
  return result.success;
}

// Configuration.

export const SlackConfigurationTypeSchema = z.object({
  botEnabled: z.boolean(),
  whitelistedDomains: z.array(z.string()).optional(),
  autoReadChannelPatterns: SlackAutoReadPatternsSchema,
  restrictedSpaceAgentsEnabled: z.boolean().optional(),
  feedbackVisibleToAuthorOnly: z.boolean().optional(),
  privateIntegrationCredentialId: z.string().optional(),
});

export type SlackConfigurationType = z.infer<
  typeof SlackConfigurationTypeSchema
>;

// Whitelist.

export type SlackbotWhitelistType = "summon_agent" | "index_messages";

export function isSlackbotWhitelistType(
  value: unknown
): value is SlackbotWhitelistType {
  return value === "summon_agent" || value === "index_messages";
}
