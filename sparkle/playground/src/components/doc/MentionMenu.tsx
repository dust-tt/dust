import { type ComposerSuggestionItem, Robot } from "@dust-tt/sparkle";
import { createContext, type ReactNode, useContext } from "react";

import type { DocAuthor } from "./docTypes";

// "@" suggestions in comment inputs (Sparkle's ComposerInput): who already
// contributed to this file first, then people, then agents. Inputs read the
// candidates from context.

export interface MentionCandidate extends DocAuthor {
  kind: "person" | "agent";
}

export interface MentionCandidates {
  inThisFile: MentionCandidate[];
  people: MentionCandidate[];
  agents: MentionCandidate[];
}

const MentionContext = createContext<MentionCandidates>({
  inThisFile: [],
  people: [],
  agents: [],
});

export function MentionProvider({
  candidates,
  children,
}: {
  candidates: MentionCandidates;
  children: ReactNode;
}) {
  return (
    <MentionContext.Provider value={candidates}>
      {children}
    </MentionContext.Provider>
  );
}

/** The candidates as ComposerInput suggestion items, each name once. */
export function useMentionItems(): ComposerSuggestionItem[] {
  const { inThisFile, people, agents } = useContext(MentionContext);
  const seen = new Set<string>();
  const items: ComposerSuggestionItem[] = [];
  const add = (candidates: MentionCandidate[], section: string) => {
    for (const candidate of candidates) {
      if (seen.has(candidate.name)) {
        continue;
      }
      seen.add(candidate.name);
      items.push({
        id: candidate.name,
        label: candidate.name,
        description: candidate.kind === "agent" ? `Agent · ${section}` : section,
        icon: candidate.kind === "agent" ? Robot : undefined,
        visual: candidate.pictureUrl,
      });
    }
  };
  add(inThisFile, "In this file");
  add(people, "People");
  add(agents, "Agents");
  return items;
}
