import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type {
  SkillSuggestionKind,
  SkillSuggestionPayload,
  SkillSuggestionSource,
  SkillSuggestionState,
} from "@app/types/suggestions/skill_suggestion";

export class SkillSuggestionFactory {
  static async create(
    auth: Authenticator,
    skill: SkillResource,
    overrides: Partial<{
      kind: SkillSuggestionKind;
      suggestion: SkillSuggestionPayload;
      analysis: string | null;
      state: SkillSuggestionState;
      source: SkillSuggestionSource;
    }> = {}
  ): Promise<SkillSuggestionResource> {
    return SkillSuggestionResource.createSuggestionForSkill(auth, skill, {
      kind: overrides.kind ?? "edit",
      suggestion: overrides.suggestion ?? {
        instructionEdits: [
          {
            old_string: "original text",
            new_string: "updated skill instructions",
            expected_occurrences: 1,
          },
        ],
      },
      analysis: overrides.analysis ?? "Improved instructions",
      state: overrides.state ?? "pending",
      source: overrides.source ?? "reinforcement",
    });
  }

  static async createEdit(
    auth: Authenticator,
    skill: SkillResource,
    overrides: Partial<{
      suggestion: {
        instructionEdits?: {
          old_string: string;
          new_string: string;
          expected_occurrences: number;
        }[];
        toolEdits?: { action: "add" | "remove"; toolId: string }[];
      };
      analysis: string | null;
      state: SkillSuggestionState;
      source: SkillSuggestionSource;
    }> = {}
  ): Promise<SkillSuggestionResource> {
    return this.create(auth, skill, {
      kind: "edit",
      suggestion: overrides.suggestion ?? {
        instructionEdits: [
          {
            old_string: "original text",
            new_string: "updated skill instructions",
            expected_occurrences: 1,
          },
        ],
      },
      analysis: overrides.analysis,
      state: overrides.state,
      source: overrides.source,
    });
  }

  static async setCreatedAt(
    suggestion: SkillSuggestionResource,
    createdAt: Date
  ): Promise<void> {
    // biome-ignore lint/plugin/noRawSql: Raw SQL is the only reliable way to backdate timestamps in tests
    await frontSequelize.query(
      `UPDATE skill_suggestions SET "createdAt" = :createdAt, "updatedAt" = :createdAt WHERE id = :id`,
      {
        replacements: {
          createdAt: createdAt.toISOString(),
          id: suggestion.id,
        },
      }
    );
  }
}
