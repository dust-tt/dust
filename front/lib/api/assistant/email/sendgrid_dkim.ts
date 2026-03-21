const REPEATED_DKIM_ENTRY_SEPARATOR_PATTERN = /\}\s*,?\s*\{/g;
const SENDGRID_DKIM_ENTRY_PATTERN = /^@([^:\s]+)\s*:\s*([^,\s}]+)$/;

export type InboundEmailDkimResult = {
  domain: string;
  result: string;
};

export function parseSendgridDkimResults(
  rawDkim: string | null
): InboundEmailDkimResult[] {
  if (!rawDkim) {
    return [];
  }

  const trimmedDkim = rawDkim.trim();
  if (!trimmedDkim.startsWith("{") || !trimmedDkim.endsWith("}")) {
    return [];
  }

  const normalizedDkim = trimmedDkim
    .replace(REPEATED_DKIM_ENTRY_SEPARATOR_PATTERN, ",")
    .slice(1, -1);
  if (normalizedDkim.length === 0) {
    return [];
  }

  const dkimResults: InboundEmailDkimResult[] = [];
  for (const entry of normalizedDkim.split(",")) {
    const match = entry.trim().match(SENDGRID_DKIM_ENTRY_PATTERN);
    if (!match) {
      return [];
    }

    const [, domain, result] = match;
    dkimResults.push({
      domain: domain.toLowerCase(),
      result: result.toLowerCase(),
    });
  }

  return dkimResults;
}
