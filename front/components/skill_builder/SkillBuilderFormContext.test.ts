import { skillBuilderFormSchema } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  AGENT_FACING_DESCRIPTION_MAX_LENGTH,
  USER_FACING_DESCRIPTION_MAX_LENGTH,
} from "@app/lib/skills/labels";
import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";

describe("skill description validation", () => {
  const resolver = zodResolver(
    skillBuilderFormSchema.pick({
      agentFacingDescription: true,
      userFacingDescription: true,
    })
  );
  const maxLengths = {
    agentFacingDescription: AGENT_FACING_DESCRIPTION_MAX_LENGTH,
    userFacingDescription: USER_FACING_DESCRIPTION_MAX_LENGTH,
  };
  const values = {
    agentFacingDescription: "a".repeat(maxLengths.agentFacingDescription),
    userFacingDescription: "b".repeat(maxLengths.userFacingDescription),
  };

  it("accepts descriptions at their limits", async () => {
    const result = await resolver(values, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });

    expect(result.errors).toEqual({});
    expect(result.values).toEqual(values);
  });

  it.each([
    "agentFacingDescription",
    "userFacingDescription",
  ] as const)("returns an RHF field error for an oversized %s", async (field) => {
    const result = await resolver(
      { ...values, [field]: "a".repeat(maxLengths[field] + 1) },
      undefined,
      { fields: {}, shouldUseNativeValidation: false }
    );

    expect(result.errors).toMatchObject({
      [field]: {
        message: `Description must be ${maxLengths[field]} characters or less`,
      },
    });
  });
});
