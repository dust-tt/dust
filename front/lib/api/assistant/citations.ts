import _ from "lodash";

import { MAX_ACTIONS_PER_STEP } from "@app/lib/api/assistant/agent";
import { rand } from "@app/lib/utils/seeded_random";

/**
 * REFS are 3-character references used to cite documents or web pages.
 * They are generated randomly and are unique.
 * With this configuration, we generate 52×9×52=24336 references.
 *
 * Since we have currently max 8 steps, and 16 actions per step,
 * we could have up to 190 refs per action.
 *
 * We currently limit to 64 refs per action.
 */
const REFS_PER_ACTION = 64;
let REFS: string[] | null = null;
const getRand = rand("chawarma");
export const getRefs = () => {
  const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const nb = "123456789".split("");

  if (REFS === null) {
    REFS = c
      .map((c1) => {
        return nb.map((n) => {
          return c.map((c2) => {
            return `${c1}${n}${c2}`;
          });
        });
      })
      .flat(2);
    // randomize
    REFS.sort(() => {
      const r = getRand();
      return r > 0.5 ? 1 : -1;
    });
  }
  return REFS;
};

/**
 * Get the refs for a given action in a step.
 */
export const getRefsForActionInStep = ({
  stepIndex,
  actionIndex,
}: {
  stepIndex: number;
  actionIndex: number;
}) => {
  const allRefs = getRefs();
  const startIndex =
    stepIndex * MAX_ACTIONS_PER_STEP * REFS_PER_ACTION +
    actionIndex * REFS_PER_ACTION;

  return _.slice(allRefs, startIndex, startIndex + REFS_PER_ACTION);
};

/**
 * Prompt to remind agents how to cite documents or web pages.
 */
export function citationMetaPrompt() {
  return (
    "To cite documents or web pages retrieved with a 2-character or 3-character REFERENCE, " +
    "use the markdown directive :cite[REFERENCE] " +
    "(eg :cite[xxx] or :cite[xxx,xxx] but not :cite[xxx][xxx]). " +
    "Ensure citations are placed as close as possible to the related information."
  );
}
