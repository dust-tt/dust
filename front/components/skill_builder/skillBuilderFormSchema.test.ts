import { getSkillBuilderFormSchema } from "@app/components/skill_builder/skillBuilderFormSchema";
import { i18n } from "@app/lib/i18n/i18n";
import {
  AGENT_FACING_DESCRIPTION_MAX_LENGTH,
  USER_FACING_DESCRIPTION_MAX_LENGTH,
} from "@app/lib/skills/labels";
import { zodResolver } from "@hookform/resolvers/zod";
import { describe, expect, it } from "vitest";

describe("skill description validation", () => {
  const schema = getSkillBuilderFormSchema((descriptor) => i18n._(descriptor));
  const resolver = zodResolver(
    schema.pick({
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

  it.each(["agentFacingDescription", "userFacingDescription"] as const)(
    "returns an RHF field error for an oversized %s",
    async (field) => {
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
    }
  );
});
