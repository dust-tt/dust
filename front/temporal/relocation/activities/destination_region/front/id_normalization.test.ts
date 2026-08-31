import {
  buildDestinationIdNormalization,
  buildIdMapping,
  extractRowsFromStatements,
  normalizeStatements,
} from "@app/temporal/relocation/activities/destination_region/front/id_normalization";
import type { CoreEntitiesRelocationBlob } from "@app/temporal/relocation/activities/types";
import { generateParameterizedInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("destination ID normalization", () => {
  it("builds mappings by stable identity", () => {
    expect(
      buildIdMapping(
        [
          { id: 10, stableId: "same-user" },
          { id: 20, stableId: "new-user" },
          { id: 30, stableId: null },
        ],
        [{ id: 42, stableId: "same-user" }]
      )
    ).toEqual({ "10": 42 });
  });

  it("extracts source rows from parameterized statements", () => {
    expect(
      extractRowsFromStatements([
        {
          columns: ["id", "code"],
          params: [10, "FREE", 20, "PRO"],
          sql: "unused",
        },
      ])
    ).toEqual([
      { id: 10, code: "FREE" },
      { id: 20, code: "PRO" },
    ]);
  });

  it("reads columns from statements produced by older source workers", () => {
    expect(
      extractRowsFromStatements([
        {
          params: [10, "FREE"],
          sql: 'INSERT INTO "plans" ("id","code") VALUES ($1,$2);',
        },
      ])
    ).toEqual([{ id: 10, code: "FREE" }]);
  });

  it("rewrites declared columns without mutating statements", () => {
    const statements = [
      {
        columns: ["id", "userId", "planId"],
        params: [1, 10, 20, 2, 11, 21],
        sql: "unused",
      },
    ];

    const normalized = normalizeStatements({
      normalization: {
        rules: [
          {
            idMapping: { "10": 100 },
            columnsByTable: { subscriptions: ["userId"] },
          },
          {
            idMapping: { "20": 200 },
            columnsByTable: { subscriptions: ["planId"] },
          },
        ],
      },
      statements,
      tableName: "subscriptions",
    });

    expect(normalized[0]?.params).toEqual([1, 100, 200, 2, 11, 21]);
    expect(statements[0]?.params).toEqual([1, 10, 20, 2, 11, 21]);
  });

  it("resolves user and plan conflicts from the destination database", async () => {
    const destinationUser = await UserFactory.basic();
    const destinationPlan = await PlanFactory.enterprise(
      "ENT_DESTINATION_ID_NORMALIZATION"
    );
    const sourceUserId = destinationUser.id + 1_000_000;
    const sourcePlanId = destinationPlan.id + 1_000_000;
    const blob: CoreEntitiesRelocationBlob = {
      statements: {
        plans: generateParameterizedInsertStatements("plans", [
          { id: sourcePlanId, code: destinationPlan.code },
        ]),
        user_metadata: [],
        users: generateParameterizedInsertStatements("users", [
          {
            id: sourceUserId,
            workOSUserId: destinationUser.workOSUserId,
          },
        ]),
        workspace: [],
      },
    };

    const normalization = await buildDestinationIdNormalization({ blob });
    const userRule = normalization.rules.find(
      ({ idMapping }) => idMapping[sourceUserId.toString()] !== undefined
    );

    expect(normalization.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idMapping: { [sourceUserId.toString()]: destinationUser.id },
        }),
        {
          idMapping: { [sourcePlanId.toString()]: destinationPlan.id },
          columnsByTable: { subscriptions: ["planId"] },
        },
      ])
    );
    expect(userRule?.columnsByTable.user_metadata).toContain("userId");

    const [normalizedMembership] = normalizeStatements({
      normalization,
      statements: generateParameterizedInsertStatements("memberships", [
        {
          id: 900_001,
          userId: sourceUserId,
          workspaceId: 900_002,
        },
      ]),
      tableName: "memberships",
    });
    const [normalizedSubscription] = normalizeStatements({
      normalization,
      statements: generateParameterizedInsertStatements("subscriptions", [
        {
          id: 900_003,
          planId: sourcePlanId,
          workspaceId: 900_002,
        },
      ]),
      tableName: "subscriptions",
    });

    expect(userRule?.columnsByTable.memberships).toContain("userId");
    expect(normalizedMembership?.params).toEqual([
      900_001,
      destinationUser.id,
      900_002,
    ]);
    expect(normalizedMembership?.params).not.toContain(sourceUserId);
    expect(normalizedSubscription?.params).toEqual([
      900_003,
      destinationPlan.id,
      900_002,
    ]);
    expect(normalizedSubscription?.params).not.toContain(sourcePlanId);
  });
});
