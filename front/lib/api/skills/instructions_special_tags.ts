import { extractKnowledgeTagSignatures } from "@app/lib/editor/knowledge_node_constants";
import { extractUniqueSkillReferenceIds } from "@app/lib/skills/format";
import { extractToolTags, serializeToolTag } from "@app/lib/tools/format";

const SPECIAL_TAG_CATEGORIES = ["nested skills", "knowledge", "tools"] as const;
export type SpecialTagCategory = (typeof SPECIAL_TAG_CATEGORIES)[number];

// Skills can embed special tags in their instructions that the builder wires up:
// nested skill references, knowledge, and tools. The agent only ever sees them as
// opaque markup, and the two groups follow different rules:
//   - Nested skill references are re-derived from the instructions on every save,
//     so the agent may freely add them (they get wired). Removing one would
//     silently unlink a skill the builder attached, so a drop is disallowed.
//   - Knowledge and tool tags cannot be wired from text alone; their attachments
//     are carried over from the existing skill untouched. So adding, dropping, or
//     altering one desyncs the markup from the real attachments, and any change is
//     disallowed.
// A freshly created agent skill has no attachments at all, so on create every
// special tag is a phantom and is rejected outright (see findSpecialTagsPresent).
function extractSpecialTagSignatures(
  content: string
): Record<SpecialTagCategory, string[]> {
  return {
    "nested skills": extractUniqueSkillReferenceIds(content),
    knowledge: extractKnowledgeTagSignatures(content),
    tools: extractToolTags(content).map((tool) => serializeToolTag(tool)),
  };
}

// Returns true if any value in `values` is absent from `from`.
function isMissingAnySignature(values: string[], from: string[]): boolean {
  const fromSet = new Set(from);
  return values.some((value) => !fromSet.has(value));
}

// Returns the special tag categories present in `content`. Used on create, where
// the skill has no attachments and so cannot carry any special tag.
export function findSpecialTagsPresent(content: string): SpecialTagCategory[] {
  const signatures = extractSpecialTagSignatures(content);
  return SPECIAL_TAG_CATEGORIES.filter(
    (category) => signatures[category].length > 0
  );
}

// Returns the special tag categories whose change between `before` and `after`
// the agent is not allowed to make (see the rules above): a dropped nested skill
// reference, or any added, dropped, or altered knowledge or tool tag.
export function findDisallowedSpecialTagChanges(
  before: string,
  after: string
): SpecialTagCategory[] {
  const beforeSignatures = extractSpecialTagSignatures(before);
  const afterSignatures = extractSpecialTagSignatures(after);

  const disallowed: SpecialTagCategory[] = [];
  if (
    isMissingAnySignature(
      beforeSignatures["nested skills"],
      afterSignatures["nested skills"]
    )
  ) {
    disallowed.push("nested skills");
  }
  for (const category of ["knowledge", "tools"] as const) {
    const beforeValues = beforeSignatures[category];
    const afterValues = afterSignatures[category];
    if (
      isMissingAnySignature(beforeValues, afterValues) ||
      isMissingAnySignature(afterValues, beforeValues)
    ) {
      disallowed.push(category);
    }
  }

  return disallowed;
}
