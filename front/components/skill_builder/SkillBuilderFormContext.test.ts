import { skillBuilderFormSchema } from "@app/components/skill_builder/SkillBuilderFormContext";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";

describe("skill description validation", () => {
  const resolver = zodResolver(
    skillBuilderFormSchema.pick({ userFacingDescription: true })
  );

  it("accepts a description at the limit", async () => {
    const values = {
      userFacingDescription: "a".repeat(USER_FACING_DESCRIPTION_MAX_LENGTH),
    };

    const result = await resolver(values, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });

    expect(result.errors).toEqual({});
    expect(result.values).toEqual(values);
  });

  it("returns an RHF field error for an oversized description", async () => {
    const result = await resolver(
      {
        userFacingDescription: "a".repeat(
          USER_FACING_DESCRIPTION_MAX_LENGTH + 1
        ),
      },
      undefined,
      { fields: {}, shouldUseNativeValidation: false }
    );

    expect(result.errors).toMatchObject({
      userFacingDescription: {
        message: `Description must be ${USER_FACING_DESCRIPTION_MAX_LENGTH} characters or less`,
      },
    });
  });
});
