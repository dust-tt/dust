import { buildDescendantMap } from "@app/lib/editor/instructions_block_conflict";
import {
  hasSuggestionSelfConflict,
  instructionEditSetsConflict,
  pruneConflictingSkillAvailabilitySuggestions,
  pruneConflictingSkillEditorsSuggestions,
  pruneConflictingSkillEditSuggestions,
  pruneConflictingSkillNameSuggestions,
  pruneConflictingSkillReinforcementModeSuggestions,
  pruneConflictingSkillUserFacingDescriptionSuggestions,
  pruneOutdatedSkillEditSuggestions,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { SkillEditSuggestionType } from "@app/types/suggestions/skill_suggestion";
import {
  isAvailabilitySkillSuggestion,
  isEditorsSkillSuggestion,
  isEditSkillSuggestion,
  isNameSkillSuggestion,
  isReinforcementModeSkillSuggestion,
  isUserFacingDescriptionSkillSuggestion,
} from "@app/types/suggestions/skill_suggestion";
import { beforeEach, describe, expect, it } from "vitest";

const HIERARCHY_HTML = `
  <div data-block-id="section-1">
    <p data-block-id="para-1">First paragraph.</p>
    <p data-block-id="para-2">Second paragraph.</p>
  </div>
  <div data-block-id="section-2">
    <p data-block-id="para-3">Third paragraph.</p>
  </div>
`;

function makeInstructionEdit(targetBlockId: string): {
  targetBlockId: string;
  content: string;
  type: "replace";
} {
  return {
    targetBlockId,
    content: `<p>Content for ${targetBlockId}</p>`,
    type: "replace",
  };
}

const EMPTY_DESCENDANT_MAP = new Map<string, Set<string>>();

function descendantMapForConflict(
  html: string | null,
  editsA: Array<{ targetBlockId: string }>,
  editsB: Array<{ targetBlockId: string }>
): Map<string, Set<string>> {
  if (!html) {
    return EMPTY_DESCENDANT_MAP;
  }
  return buildDescendantMap(html, [
    ...editsA.map((e) => e.targetBlockId),
    ...editsB.map((e) => e.targetBlockId),
  ]);
}

describe("instructionEditSetsConflict", () => {
  it("returns false when either set is empty", () => {
    expect(
      instructionEditSetsConflict(
        [],
        [makeInstructionEdit("para-1")],
        null,
        EMPTY_DESCENDANT_MAP
      )
    ).toBe(false);
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("para-1")],
        [],
        null,
        EMPTY_DESCENDANT_MAP
      )
    ).toBe(false);
    expect(
      instructionEditSetsConflict([], [], null, EMPTY_DESCENDANT_MAP)
    ).toBe(false);
  });

  it("conflicts when either set contains root rewrite", () => {
    const root = makeInstructionEdit(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID);
    const block = makeInstructionEdit("para-1");

    expect(
      instructionEditSetsConflict([root], [block], null, EMPTY_DESCENDANT_MAP)
    ).toBe(true);
    expect(
      instructionEditSetsConflict([block], [root], null, EMPTY_DESCENDANT_MAP)
    ).toBe(true);
    expect(
      instructionEditSetsConflict([root], [root], null, EMPTY_DESCENDANT_MAP)
    ).toBe(true);
  });

  it("conflicts when both sets target the same block ID", () => {
    const editA = makeInstructionEdit("para-1");
    const editB = makeInstructionEdit("para-1");

    expect(
      instructionEditSetsConflict([editA], [editB], null, EMPTY_DESCENDANT_MAP)
    ).toBe(true);
  });

  it("does not conflict when sets target different, unrelated blocks", () => {
    const editsA = [makeInstructionEdit("para-1")];
    const editsB = [makeInstructionEdit("para-3")];
    expect(
      instructionEditSetsConflict(
        editsA,
        editsB,
        HIERARCHY_HTML,
        descendantMapForConflict(HIERARCHY_HTML, editsA, editsB)
      )
    ).toBe(false);
  });

  it("conflicts when A targets an ancestor of a block in B", () => {
    const editsA = [makeInstructionEdit("section-1")];
    const editsB = [makeInstructionEdit("para-1")];
    expect(
      instructionEditSetsConflict(
        editsA,
        editsB,
        HIERARCHY_HTML,
        descendantMapForConflict(HIERARCHY_HTML, editsA, editsB)
      )
    ).toBe(true);
  });

  it("conflicts when B targets an ancestor of a block in A (symmetric)", () => {
    const editsA = [makeInstructionEdit("para-1")];
    const editsB = [makeInstructionEdit("section-1")];
    expect(
      instructionEditSetsConflict(
        editsA,
        editsB,
        HIERARCHY_HTML,
        descendantMapForConflict(HIERARCHY_HTML, editsA, editsB)
      )
    ).toBe(true);
  });

  it("does not conflict for siblings even without instructionsHtml", () => {
    expect(
      instructionEditSetsConflict(
        [makeInstructionEdit("para-1")],
        [makeInstructionEdit("para-2")],
        null,
        EMPTY_DESCENDANT_MAP
      )
    ).toBe(false);
  });

  it("does not conflict for siblings with instructionsHtml", () => {
    const editsA = [makeInstructionEdit("para-1")];
    const editsB = [makeInstructionEdit("para-2")];
    expect(
      instructionEditSetsConflict(
        editsA,
        editsB,
        HIERARCHY_HTML,
        descendantMapForConflict(HIERARCHY_HTML, editsA, editsB)
      )
    ).toBe(false);
  });

  it("conflicts when a block in A targets a deeply nested descendant via B", () => {
    const editsA = [makeInstructionEdit("section-1")];
    const editsB = [makeInstructionEdit("para-2")];
    expect(
      instructionEditSetsConflict(
        editsA,
        editsB,
        HIERARCHY_HTML,
        descendantMapForConflict(HIERARCHY_HTML, editsA, editsB)
      )
    ).toBe(true);
  });
});

function makeSuggestion(
  overrides: Partial<SkillEditSuggestionType> = {}
): SkillEditSuggestionType {
  return {
    instructionEdits: [],
    ...overrides,
  } as SkillEditSuggestionType;
}

describe("hasSuggestionSelfConflict", () => {
  it("returns false for non-conflicting instruction edits", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit("para-1"),
            makeInstructionEdit("para-3"),
          ],
        }),
        HIERARCHY_HTML
      )
    ).toBe(false);
  });

  it("conflicts when root rewrite is combined with any other instruction edit", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID),
            makeInstructionEdit("para-1"),
          ],
        }),
        null
      )
    ).toBe(true);
  });

  it("conflicts when two instruction edits target the same block", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit("para-1"),
            makeInstructionEdit("para-1"),
          ],
        }),
        null
      )
    ).toBe(true);
  });

  it("conflicts when one instruction edit targets an ancestor of another", () => {
    expect(
      hasSuggestionSelfConflict(
        makeSuggestion({
          instructionEdits: [
            makeInstructionEdit("section-1"),
            makeInstructionEdit("para-1"),
          ],
        }),
        HIERARCHY_HTML
      )
    ).toBe(true);
  });
});

describe("pruneOutdatedSkillEditSuggestions", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  describe("instruction edits", () => {
    it("marks a suggestion outdated when its target block no longer exists in the skill", async () => {
      const skill = await SkillFactory.create(authenticator, {
        instructionsHtml: '<p data-block-id="block-1">Content.</p>',
      });
      const suggestion = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        { suggestion: { instructionEdits: [makeInstructionEdit("block-1")] } }
      );

      // Simulate the user removing the block by saving a new HTML without it.
      await skill.updateSkill(authenticator, {
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
        userFacingDescription: skill.userFacingDescription,
        instructions: skill.instructions,
        instructionsHtml: '<p data-block-id="block-2">New content.</p>',
        icon: skill.icon,
        mcpServerViews: skill.mcpServerViews,
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [],
        attachedKnowledge: [],
      });

      await pruneOutdatedSkillEditSuggestions(authenticator, skill);

      const fetched = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("outdated");
    });

    it("keeps a suggestion pending when its target block still exists", async () => {
      const skill = await SkillFactory.create(authenticator, {
        instructionsHtml:
          '<p data-block-id="block-1">A.</p><p data-block-id="block-2">B.</p>',
      });
      const suggestion = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        { suggestion: { instructionEdits: [makeInstructionEdit("block-1")] } }
      );

      // Save with block-1 still present.
      await skill.updateSkill(authenticator, {
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
        userFacingDescription: skill.userFacingDescription,
        instructions: skill.instructions,
        instructionsHtml:
          '<p data-block-id="block-1">Updated A.</p><p data-block-id="block-2">B.</p>',
        icon: skill.icon,
        mcpServerViews: skill.mcpServerViews,
        manuallyRequestedSpaceIds: [],
        requestedSpaceIds: [],
        attachedKnowledge: [],
      });

      await pruneOutdatedSkillEditSuggestions(authenticator, skill);

      const fetched = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("pending");
    });

    it("marks a root-rewrite suggestion outdated after any save", async () => {
      const skill = await SkillFactory.create(authenticator, {
        instructionsHtml: '<p data-block-id="block-1">Content.</p>',
      });
      const suggestion = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        {
          suggestion: {
            instructionEdits: [
              makeInstructionEdit(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID),
            ],
          },
        }
      );

      await pruneOutdatedSkillEditSuggestions(authenticator, skill);

      const fetched = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestion.sId
      );
      expect(fetched?.state).toBe("outdated");
    });
  });
});

describe("pruneConflictingSkillEditSuggestions — agentFacingDescriptionEdit", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  const createEdit = async (
    skill: Awaited<ReturnType<typeof SkillFactory.create>>,
    overrides: Parameters<typeof SkillSuggestionFactory.createEdit>[2]
  ) => {
    const created = await SkillSuggestionFactory.createEdit(
      authenticator,
      skill,
      overrides
    );
    if (!isEditSkillSuggestion(created)) {
      throw new Error("The factory did not create an edit suggestion.");
    }

    return created;
  };

  it("a new description-edit suggestion outdates an older description-edit suggestion", async () => {
    const skill = await SkillFactory.create(authenticator, {
      instructionsHtml: '<p data-block-id="block-1">Content.</p>',
    });
    const older = await createEdit(skill, {
      suggestion: {
        agentFacingDescriptionEdit: {
          content: "First proposed description.",
        },
      },
    });
    const newer = await createEdit(skill, {
      suggestion: {
        agentFacingDescriptionEdit: {
          content: "Second proposed description.",
        },
      },
    });

    await pruneConflictingSkillEditSuggestions(authenticator, skill, newer);

    const olderRefetched = await SkillSuggestionResource.fetchById(
      authenticator,
      older.sId
    );
    const newerRefetched = await SkillSuggestionResource.fetchById(
      authenticator,
      newer.sId
    );
    expect(olderRefetched?.state).toBe("outdated");
    expect(newerRefetched?.state).toBe("pending");
  });

  it("a new description-edit suggestion does NOT outdate an instruction-only suggestion", async () => {
    const skill = await SkillFactory.create(authenticator, {
      instructionsHtml: '<p data-block-id="block-1">Content.</p>',
    });
    const instructionOnly = await createEdit(skill, {
      suggestion: {
        instructionEdits: [makeInstructionEdit("block-1")],
      },
    });
    const newer = await createEdit(skill, {
      suggestion: {
        agentFacingDescriptionEdit: { content: "New description." },
      },
    });

    await pruneConflictingSkillEditSuggestions(authenticator, skill, newer);

    const refetched = await SkillSuggestionResource.fetchById(
      authenticator,
      instructionOnly.sId
    );
    expect(refetched?.state).toBe("pending");
  });

  it("a new instruction-only suggestion does NOT outdate an older description-edit suggestion", async () => {
    const skill = await SkillFactory.create(authenticator, {
      instructionsHtml: '<p data-block-id="block-1">Content.</p>',
    });
    const descriptionOnly = await createEdit(skill, {
      suggestion: {
        agentFacingDescriptionEdit: { content: "Existing description." },
      },
    });
    const newer = await createEdit(skill, {
      suggestion: {
        instructionEdits: [makeInstructionEdit("block-1")],
      },
    });

    await pruneConflictingSkillEditSuggestions(authenticator, skill, newer);

    const refetched = await SkillSuggestionResource.fetchById(
      authenticator,
      descriptionOnly.sId
    );
    expect(refetched?.state).toBe("pending");
  });
});

describe("pruneConflictingSkillEditorsSuggestions", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  const createEditors = async (
    skill: Awaited<ReturnType<typeof SkillFactory.create>>,
    suggestion: { addUserIds?: string[]; removeUserIds?: string[] }
  ) => {
    const created = await SkillSuggestionFactory.create(authenticator, skill, {
      kind: "editors",
      suggestion: {
        addUserIds: suggestion.addUserIds ?? [],
        removeUserIds: suggestion.removeUserIds ?? [],
      },
      source: "conversational",
    });
    if (!isEditorsSkillSuggestion(created)) {
      throw new Error("The factory did not create an editors suggestion.");
    }

    return created;
  };

  const stateOf = async (sId: string) =>
    (await SkillSuggestionResource.fetchById(authenticator, sId))?.state;

  it("outdates a pending suggestion adding the same user", async () => {
    const skill = await SkillFactory.create(authenticator);
    const older = await createEditors(skill, { addUserIds: ["usr_a"] });
    const newer = await createEditors(skill, {
      addUserIds: ["usr_a", "usr_b"],
    });

    await pruneConflictingSkillEditorsSuggestions(authenticator, skill, [
      newer,
    ]);

    expect(await stateOf(older.sId)).toBe("outdated");
    expect(await stateOf(newer.sId)).toBe("pending");
  });

  it("outdates a pending suggestion removing the same user", async () => {
    const skill = await SkillFactory.create(authenticator);
    const older = await createEditors(skill, { removeUserIds: ["usr_a"] });
    const newer = await createEditors(skill, { removeUserIds: ["usr_a"] });

    await pruneConflictingSkillEditorsSuggestions(authenticator, skill, [
      newer,
    ]);

    expect(await stateOf(older.sId)).toBe("outdated");
    expect(await stateOf(newer.sId)).toBe("pending");
  });

  it("keeps a suggestion that removes a user the new one adds", async () => {
    const skill = await SkillFactory.create(authenticator);
    const removal = await createEditors(skill, { removeUserIds: ["usr_a"] });
    const addition = await createEditors(skill, { addUserIds: ["usr_a"] });

    await pruneConflictingSkillEditorsSuggestions(authenticator, skill, [
      addition,
    ]);

    expect(await stateOf(removal.sId)).toBe("pending");
    expect(await stateOf(addition.sId)).toBe("pending");
  });

  it("keeps suggestions about other users and other skills", async () => {
    const skill = await SkillFactory.create(authenticator);
    const otherSkill = await SkillFactory.create(authenticator, {
      name: "Other Test Skill",
    });
    const otherUser = await createEditors(skill, { addUserIds: ["usr_b"] });
    const sameUserOtherSkill = await createEditors(otherSkill, {
      addUserIds: ["usr_a"],
    });
    const newer = await createEditors(skill, { addUserIds: ["usr_a"] });

    await pruneConflictingSkillEditorsSuggestions(authenticator, skill, [
      newer,
    ]);

    expect(await stateOf(otherUser.sId)).toBe("pending");
    expect(await stateOf(sameUserOtherSkill.sId)).toBe("pending");
  });

  it("leaves edit suggestions and non-pending editors suggestions alone", async () => {
    const skill = await SkillFactory.create(authenticator);
    const edit = await SkillSuggestionFactory.createEdit(authenticator, skill);
    const approved = await createEditors(skill, { addUserIds: ["usr_a"] });
    await SkillSuggestionResource.bulkUpdateState(
      authenticator,
      [approved],
      "approved"
    );
    const newer = await createEditors(skill, { addUserIds: ["usr_a"] });

    await pruneConflictingSkillEditorsSuggestions(authenticator, skill, [
      newer,
    ]);

    expect(await stateOf(edit.sId)).toBe("pending");
    expect(await stateOf(approved.sId)).toBe("approved");
  });
});

describe("pruneConflictingSkillUserFacingDescriptionSuggestions", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  const createDescription = async (
    skill: Awaited<ReturnType<typeof SkillFactory.create>>,
    userFacingDescription: string
  ) => {
    const created = await SkillSuggestionFactory.create(authenticator, skill, {
      kind: "user_facing_description",
      suggestion: { userFacingDescription },
      source: "conversational",
    });
    if (!isUserFacingDescriptionSkillSuggestion(created)) {
      throw new Error(
        "The factory did not create a user_facing_description suggestion."
      );
    }

    return created;
  };

  const stateOf = async (sId: string) =>
    (await SkillSuggestionResource.fetchById(authenticator, sId))?.state;

  it("outdates every other pending description suggestion on the skill", async () => {
    const skill = await SkillFactory.create(authenticator);
    const older = await createDescription(skill, "Older wording.");
    const other = await createDescription(skill, "Other wording.");
    const newer = await createDescription(skill, "Newer wording.");

    await pruneConflictingSkillUserFacingDescriptionSuggestions(
      authenticator,
      skill,
      [newer]
    );

    expect(await stateOf(older.sId)).toBe("outdated");
    expect(await stateOf(other.sId)).toBe("outdated");
    expect(await stateOf(newer.sId)).toBe("pending");
  });

  it("keeps suggestions of other kinds, other skills and non-pending states", async () => {
    const skill = await SkillFactory.create(authenticator);
    const otherSkill = await SkillFactory.create(authenticator, {
      name: "Other Test Skill",
    });
    const edit = await SkillSuggestionFactory.createEdit(authenticator, skill);
    const otherSkillDescription = await createDescription(
      otherSkill,
      "Other skill wording."
    );
    const approved = await createDescription(skill, "Approved wording.");
    await SkillSuggestionResource.bulkUpdateState(
      authenticator,
      [approved],
      "approved"
    );
    const newer = await createDescription(skill, "Newer wording.");

    await pruneConflictingSkillUserFacingDescriptionSuggestions(
      authenticator,
      skill,
      [newer]
    );

    expect(await stateOf(edit.sId)).toBe("pending");
    expect(await stateOf(otherSkillDescription.sId)).toBe("pending");
    expect(await stateOf(approved.sId)).toBe("approved");
  });
});

describe("pruneConflictingSkillNameSuggestions", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  const createName = async (
    skill: Awaited<ReturnType<typeof SkillFactory.create>>,
    name: string
  ) => {
    const created = await SkillSuggestionFactory.create(authenticator, skill, {
      kind: "name",
      suggestion: { name },
      source: "conversational",
    });
    if (!isNameSkillSuggestion(created)) {
      throw new Error("The factory did not create a name suggestion.");
    }

    return created;
  };

  const stateOf = async (sId: string) =>
    (await SkillSuggestionResource.fetchById(authenticator, sId))?.state;

  it("outdates every other pending rename on the skill", async () => {
    const skill = await SkillFactory.create(authenticator);
    const older = await createName(skill, "Older Name");
    const newer = await createName(skill, "Newer Name");

    await pruneConflictingSkillNameSuggestions(authenticator, skill, [newer]);

    expect(await stateOf(older.sId)).toBe("outdated");
    expect(await stateOf(newer.sId)).toBe("pending");
  });

  it("keeps suggestions of other kinds, other skills and non-pending states", async () => {
    const skill = await SkillFactory.create(authenticator);
    const otherSkill = await SkillFactory.create(authenticator, {
      name: "Other Test Skill",
    });
    const edit = await SkillSuggestionFactory.createEdit(authenticator, skill);
    const otherSkillName = await createName(otherSkill, "Other Skill Name");
    const approved = await createName(skill, "Approved Name");
    await SkillSuggestionResource.bulkUpdateState(
      authenticator,
      [approved],
      "approved"
    );
    const newer = await createName(skill, "Newer Name");

    await pruneConflictingSkillNameSuggestions(authenticator, skill, [newer]);

    expect(await stateOf(edit.sId)).toBe("pending");
    expect(await stateOf(otherSkillName.sId)).toBe("pending");
    expect(await stateOf(approved.sId)).toBe("approved");
  });
});

describe("pruneConflictingSkillAvailabilitySuggestions", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  const createAvailability = async (
    skill: Awaited<ReturnType<typeof SkillFactory.create>>,
    availability: "editors" | "workspace_users" | "users_and_agents"
  ) => {
    const created = await SkillSuggestionFactory.create(authenticator, skill, {
      kind: "availability",
      suggestion: { availability },
      source: "conversational",
    });
    if (!isAvailabilitySkillSuggestion(created)) {
      throw new Error("The factory did not create an availability suggestion.");
    }

    return created;
  };

  const stateOf = async (sId: string) =>
    (await SkillSuggestionResource.fetchById(authenticator, sId))?.state;

  it("outdates every other pending availability suggestion on the skill", async () => {
    const skill = await SkillFactory.create(authenticator);
    const older = await createAvailability(skill, "workspace_users");
    const newer = await createAvailability(skill, "users_and_agents");

    await pruneConflictingSkillAvailabilitySuggestions(authenticator, skill, [
      newer,
    ]);

    expect(await stateOf(older.sId)).toBe("outdated");
    expect(await stateOf(newer.sId)).toBe("pending");
  });

  it("keeps suggestions of other kinds, other skills and non-pending states", async () => {
    const skill = await SkillFactory.create(authenticator);
    const otherSkill = await SkillFactory.create(authenticator, {
      name: "Other Test Skill",
    });
    const edit = await SkillSuggestionFactory.createEdit(authenticator, skill);
    const otherSkillAvailability = await createAvailability(
      otherSkill,
      "workspace_users"
    );
    const approved = await createAvailability(skill, "workspace_users");
    await SkillSuggestionResource.bulkUpdateState(
      authenticator,
      [approved],
      "approved"
    );
    const newer = await createAvailability(skill, "users_and_agents");

    await pruneConflictingSkillAvailabilitySuggestions(authenticator, skill, [
      newer,
    ]);

    expect(await stateOf(edit.sId)).toBe("pending");
    expect(await stateOf(otherSkillAvailability.sId)).toBe("pending");
    expect(await stateOf(approved.sId)).toBe("approved");
  });
});

describe("pruneConflictingSkillReinforcementModeSuggestions", () => {
  let authenticator: Awaited<
    ReturnType<typeof createResourceTest>
  >["authenticator"];

  beforeEach(async () => {
    ({ authenticator } = await createResourceTest({ role: "admin" }));
  });

  const createReinforcement = async (
    skill: Awaited<ReturnType<typeof SkillFactory.create>>,
    reinforcement: "auto" | "on" | "off"
  ) => {
    const created = await SkillSuggestionFactory.create(authenticator, skill, {
      kind: "reinforcement",
      suggestion: { reinforcement },
      source: "conversational",
    });
    if (!isReinforcementModeSkillSuggestion(created)) {
      throw new Error("The factory did not create a reinforcement suggestion.");
    }

    return created;
  };

  const stateOf = async (sId: string) =>
    (await SkillSuggestionResource.fetchById(authenticator, sId))?.state;

  it("outdates every other pending self-improvement suggestion on the skill", async () => {
    const skill = await SkillFactory.create(authenticator);
    const older = await createReinforcement(skill, "off");
    const newer = await createReinforcement(skill, "auto");

    await pruneConflictingSkillReinforcementModeSuggestions(
      authenticator,
      skill,
      [newer]
    );

    expect(await stateOf(older.sId)).toBe("outdated");
    expect(await stateOf(newer.sId)).toBe("pending");
  });

  it("keeps suggestions of other kinds, other skills and non-pending states", async () => {
    const skill = await SkillFactory.create(authenticator);
    const otherSkill = await SkillFactory.create(authenticator, {
      name: "Other Test Skill",
    });
    const edit = await SkillSuggestionFactory.createEdit(authenticator, skill);
    const otherSkillReinforcement = await createReinforcement(
      otherSkill,
      "off"
    );
    const approved = await createReinforcement(skill, "off");
    await SkillSuggestionResource.bulkUpdateState(
      authenticator,
      [approved],
      "approved"
    );
    const newer = await createReinforcement(skill, "auto");

    await pruneConflictingSkillReinforcementModeSuggestions(
      authenticator,
      skill,
      [newer]
    );

    expect(await stateOf(edit.sId)).toBe("pending");
    expect(await stateOf(otherSkillReinforcement.sId)).toBe("pending");
    expect(await stateOf(approved.sId)).toBe("approved");
  });
});
