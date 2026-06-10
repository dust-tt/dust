import type {
  BenefitCard,
  IntegrationBase,
  IntegrationPageConfig,
} from "../types";

import {
  analyzeToolShape,
  pickToolsForIntent,
  type ToolShape,
} from "./toolShapeAnalysis";

// Heuristic generator for the 3-card "What you can do with X" strip.
//
// We define three "slots" — each represents a recognizable JTBD any partner
// might support — and we attempt to fill each slot using the partner's
// actual tools via `pickToolsForIntent`. Slots without enough matching tools
// are dropped, so a read-only partner shows fewer cards rather than an
// awkward empty "Take action" card.
//
// Hand-authored overrides in `enrichment.benefits` bypass this entirely.

interface BenefitSlot {
  // The intent that drives tool selection for this slot.
  intent: "read" | "write" | "summary";
  // Minimum tool count required to render the card. If
  // `pickToolsForIntent(shape, intent, ...)` returns fewer, the slot is
  // skipped.
  minTools: number;
  // How many tools to surface as chips under the card body.
  maxTools: number;
  // How to render the slot once it has tools — partner name is substituted
  // in via `buildSlot`.
  build: (partner: string) => Omit<BenefitCard, "toolMatches">;
}

const BENEFIT_SLOTS: BenefitSlot[] = [
  {
    intent: "read",
    minTools: 1,
    maxTools: 4,
    build: (partner) => ({
      icon: "ActionMagnifyingGlassIcon",
      color: "blue",
      title: `Find anything in ${partner}`,
      description: `Ask Dust to surface the right ${partner} records, threads, or files — no need to remember exact names, filters, or the right view.`,
    }),
  },
  {
    intent: "write",
    minTools: 1,
    maxTools: 4,
    build: (partner) => ({
      icon: "ActionDocumentTextIcon",
      color: "green",
      title: `Take action without leaving Dust`,
      description: `Update, create, or post in ${partner} from the same conversation where you found the context. One agent, one workflow.`,
    }),
  },
  {
    intent: "read",
    minTools: 2,
    maxTools: 4,
    build: (partner) => ({
      icon: "ActionLightbulbIcon",
      color: "golden",
      title: `Get a ${partner} recap on demand`,
      description: `Ask for a digest of what changed, what's stalled, or what to focus on — Dust pulls the data and writes the summary for you.`,
    }),
  },
];

// Try to fill a slot. Returns null if not enough tools to make the card feel
// substantive.
function buildSlot(
  slot: BenefitSlot,
  shape: ToolShape,
  partner: string,
  alreadyUsed: Set<string>
): BenefitCard | null {
  // Pull extra candidates so we can skip tools already used by earlier slots
  // (so the cards don't all show the same 3 search tools).
  const candidates = pickToolsForIntent(shape, slot.intent, slot.maxTools + 3);
  const fresh = candidates.filter((t) => !alreadyUsed.has(t));
  // Top up with any candidate that's not yet used in *this* card; reusing
  // across cards is OK if there's literally nothing else.
  const picked = fresh.slice(0, slot.maxTools);
  if (picked.length < slot.minTools) {
    return null;
  }
  for (const t of picked) {
    alreadyUsed.add(t);
  }
  const base = slot.build(partner);
  return { ...base, toolMatches: picked };
}

function generateGenericBenefits(integration: IntegrationBase): BenefitCard[] {
  const shape = analyzeToolShape(integration.tools);
  const alreadyUsed = new Set<string>();
  const cards: BenefitCard[] = [];
  for (const slot of BENEFIT_SLOTS) {
    const card = buildSlot(slot, shape, integration.name, alreadyUsed);
    if (card) {
      cards.push(card);
    }
  }
  return cards;
}

// Public entry point. Same shape as the chat helper: returns the override
// when present, falls back to the generic generator, returns [] only if both
// fail (so the section can hide itself).
export function getBenefitsForIntegration(
  integration: IntegrationPageConfig
): BenefitCard[] {
  const override = integration.enrichment?.benefits;
  if (override && override.length > 0) {
    // Cap to 3 cards so the grid stays one row on desktop.
    return override.slice(0, 3);
  }
  if (integration.tools.length === 0) {
    return [];
  }
  return generateGenericBenefits(integration);
}
