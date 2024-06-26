import { rand } from "@app/lib/utils/seeded_random";

let REFS: string[] | null = null;
const getRand = rand("chawarma");

export const getRefs = () => {
  if (REFS === null) {
    REFS = "abcdefghijklmnopqrstuvwxyz0123456789"
      .split("")
      .map((c) => {
        return "abcdefghijklmnopqrstuvwxyz0123456789".split("").map((n) => {
          return `${c}${n}`;
        });
      })
      .flat();
    // randomize
    REFS.sort(() => {
      const r = getRand();
      return r > 0.5 ? 1 : -1;
    });
  }
  return REFS;
};

/**
 * Prompt to remind agents how to cite documents or web pages.
 */
export function citationMetaPrompt() {
  return (
    "To cite documents or web pages retrieved with a 2-character REFERENCE, " +
    "use the markdown directive :cite[REFERENCE] " +
    "(eg :cite[xx] or :cite[xx,xx] but not :cite[xx][xx]). " +
    "Ensure citations are placed as close as possible to the related information."
  );
}
