import { MARKUP_MULTIPLIER } from "@app/lib/api/programmatic_usage/common";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { describe, expect, it } from "vitest";

describe("SelfImprovingSkillsUsageResource", () => {
  it("bulk creates usage rows and sums usage after a date for the workspace", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const { authenticator: otherAuthenticator } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(authenticator, {
      name: "Usage Test Skill",
    });
    const otherWorkspaceSkill = await SkillFactory.create(otherAuthenticator, {
      name: "Other Workspace Usage Test Skill",
    });

    const cutoff = new Date("2026-01-02T00:00:00.000Z");

    const usages = await SelfImprovingSkillsUsageResource.bulkCreate(
      authenticator,
      [
        {
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          skillId: skill.id,
          conversationId: null,
          priceMicroUsd: 50,
        },
        {
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          skillId: skill.id,
          conversationId: null,
          priceMicroUsd: 100,
        },
        {
          createdAt: new Date("2026-01-04T00:00:00.000Z"),
          skillId: null,
          conversationId: null,
          priceMicroUsd: 200,
        },
      ]
    );

    await SelfImprovingSkillsUsageResource.bulkCreate(otherAuthenticator, [
      {
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
        skillId: otherWorkspaceSkill.id,
        conversationId: null,
        priceMicroUsd: 500,
      },
    ]);

    const sum =
      await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdAfterDate(
        authenticator,
        cutoff
      );

    expect(usages).toHaveLength(3);
    expect(
      usages.every((usage) => usage.workspaceId === skill.workspaceId)
    ).toBe(true);
    expect(sum).toBe(300);
  });

  it("returns daily spend with markup aggregated by calendar day", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const { authenticator: otherAuthenticator } = await createResourceTest({
      role: "admin",
    });

    const skill = await SkillFactory.create(authenticator, {
      name: "Daily Spend Skill",
    });

    await SelfImprovingSkillsUsageResource.bulkCreate(authenticator, [
      {
        createdAt: new Date("2026-03-10T08:00:00.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 100,
      },
      {
        createdAt: new Date("2026-03-10T20:00:00.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 200,
      },
      {
        createdAt: new Date("2026-03-12T10:00:00.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 500,
      },
      // Outside the queried range.
      {
        createdAt: new Date("2026-03-09T23:59:59.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 999,
      },
    ]);

    // Other workspace — should be excluded.
    const otherSkill = await SkillFactory.create(otherAuthenticator, {
      name: "Other WS Skill",
    });
    await SelfImprovingSkillsUsageResource.bulkCreate(otherAuthenticator, [
      {
        createdAt: new Date("2026-03-10T12:00:00.000Z"),
        skillId: otherSkill.id,
        conversationId: null,
        priceMicroUsd: 9999,
      },
    ]);

    const result =
      await SelfImprovingSkillsUsageResource.getDailySpendMicroUsdWithMarkup(
        authenticator,
        {
          startDate: new Date("2026-03-10T00:00:00.000Z"),
          endDate: new Date("2026-03-15T00:00:00.000Z"),
        }
      );

    expect(result.get("2026-03-10")).toBe(300 * MARKUP_MULTIPLIER);
    expect(result.has("2026-03-11")).toBe(false);
    expect(result.get("2026-03-12")).toBe(500 * MARKUP_MULTIPLIER);
    expect(result.has("2026-03-09")).toBe(false);
    expect(result.size).toBe(2);
  });

  it("sums usage after a date by skill", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(authenticator, {
      name: "Usage By Skill Test Skill",
    });
    const otherSkill = await SkillFactory.create(authenticator, {
      name: "Other Usage By Skill Test Skill",
    });

    const cutoff = new Date("2026-01-02T00:00:00.000Z");

    await SelfImprovingSkillsUsageResource.bulkCreate(authenticator, [
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 50,
      },
      {
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 100,
      },
      {
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
        skillId: otherSkill.id,
        conversationId: null,
        priceMicroUsd: 200,
      },
    ]);

    const sums =
      await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdAfterDateForSkills(
        authenticator,
        { createdAfter: cutoff, skillModelIds: [skill.id, otherSkill.id] }
      );

    expect(sums.get(skill.id)).toBe(100);
    expect(sums.get(otherSkill.id)).toBe(200);
  });

  it("applies markup multiplier in WithMarkup variants", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(authenticator, {
      name: "Markup Test Skill",
    });

    const cutoff = new Date("2026-01-02T00:00:00.000Z");

    await SelfImprovingSkillsUsageResource.bulkCreate(authenticator, [
      {
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        skillId: skill.id,
        conversationId: null,
        priceMicroUsd: 100,
      },
      {
        createdAt: new Date("2026-01-04T00:00:00.000Z"),
        skillId: null,
        conversationId: null,
        priceMicroUsd: 200,
      },
    ]);

    const sumWithMarkup =
      await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdWithMarkupAfterDate(
        authenticator,
        cutoff
      );
    const sumWithoutMarkup =
      await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdAfterDate(
        authenticator,
        cutoff
      );

    expect(sumWithMarkup).toBe(sumWithoutMarkup * MARKUP_MULTIPLIER);

    const sumsWithMarkup =
      await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdWithMarkupAfterDateForSkills(
        authenticator,
        { createdAfter: cutoff, skillModelIds: [skill.id] }
      );
    const sumsWithoutMarkup =
      await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdAfterDateForSkills(
        authenticator,
        { createdAfter: cutoff, skillModelIds: [skill.id] }
      );

    expect(sumsWithMarkup.get(skill.id)).toBe(
      (sumsWithoutMarkup.get(skill.id) ?? 0) * MARKUP_MULTIPLIER
    );
  });
});
