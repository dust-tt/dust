const MIN_TERM_LENGTH = 3;

export const STOPWORDS = new Set(
  ("a an and are as at be but by can for from has have help helps how i if in into is it its "
   + "me my of on or our so that the their them then there these they this to use used user "
   + "users using was what when which who will with without you your agent assistant").split(" ")
);

export function splitName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .toLowerCase()
    .trim();
}

// Approximates the index-time light_english stemmer well enough to compare a query term
// against document text in JS, without a round trip to _analyze per term.
export function normalize(token: string): string {
  return token.replace(/(ies)$/, "y").replace(/(sses|ses|es|s)$/, "");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TERM_LENGTH && !STOPWORDS.has(token))
    .map(normalize);
}

export function contentTerms(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function documentTerms(name: string, description: string): Set<string> {
  return contentTerms(`${splitName(name)} ${description}`);
}
