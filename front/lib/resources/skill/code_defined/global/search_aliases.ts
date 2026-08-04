import type { GlobalSkillId } from "@app/lib/resources/skill/code_defined/global_registry";

export const GLOBAL_SKILL_SEARCH_ALIASES: Readonly<
  Record<string, readonly string[]>
> = {
  "go-deep": ["Deep Dive"],
  "frames": ["Frames"],
  "sandbox": ["Sandbox"],  // Currently called "Computer", but makes sense to think of it as a sandbox.
} satisfies Partial<Record<GlobalSkillId, readonly string[]>>;
