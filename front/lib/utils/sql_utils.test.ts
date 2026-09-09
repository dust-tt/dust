import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import {
  runAfterTransactionCommit,
  withTransaction,
  withTransactionResult,
} from "@app/lib/utils/sql_utils";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/utils/cache");

describe("withTransactionResult", () => {
  it("rolls back an error result without undoing earlier outer writes", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const first = await SkillFactory.create(auth, {
      name: "Outer result skill",
    });
    const second = await SkillFactory.create(auth, {
      name: "Inner result skill",
    });
    const effect = vi.fn(async () => {});
    const failure = new Err(new Error("Invalid later mutation"));
    await withTransaction(
      async (outer) => {
        await first.archive(auth, { transaction: outer });
        const result = await withTransactionResult(async (inner) => {
          await second.archive(auth, { transaction: inner });
          await runAfterTransactionCommit(inner, effect);
          return failure;
        }, outer);
        expect(result).toBe(failure);
        const current = await SkillResource.fetchByIds(
          auth,
          [first.sId, second.sId],
          { permissionFiltering: "redact_unreadable" }
        );
        expect(
          new Map(current.map((skill) => [skill.sId, skill.status]))
        ).toEqual(
          new Map([
            [first.sId, "archived"],
            [second.sId, "active"],
          ])
        );
        expect(effect).not.toHaveBeenCalled();
        // A rolled-back result leaves the caller transaction usable.
        await withTransactionResult(async (inner) => {
          await second.archive(auth, { transaction: inner });
          return new Ok(undefined);
        }, outer);
      },
      undefined,
      { useSavepoint: true }
    );
    const current = await SkillResource.fetchByIds(
      auth,
      [first.sId, second.sId],
      { permissionFiltering: "redact_unreadable" }
    );
    expect(current.map((skill) => skill.status)).toEqual([
      "archived",
      "archived",
    ]);
    expect(effect).not.toHaveBeenCalled();
  });

  it("rolls back a thrown error and preserves its identity", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const failure = new Error("Unexpected result callback failure");
    const effect = vi.fn(async () => {});
    await expect(
      withTransactionResult(async (transaction) => {
        await skill.archive(auth, { transaction });
        await runAfterTransactionCommit(transaction, effect);
        throw failure;
      })
    ).rejects.toBe(failure);
    expect(
      await SkillResource.fetchById(auth, skill.sId, {
        permissionFiltering: "redact_unreadable",
      })
    ).toMatchObject({ status: "active" });
    expect(effect).not.toHaveBeenCalled();
  });

  it("defers successful nested result effects until the root commits", async () => {
    const effect = vi.fn(async () => {});
    await frontSequelize.transaction(async (root) => {
      const result = await withTransactionResult(async (outer) => {
        const result = await withTransactionResult(async (inner) => {
          await runAfterTransactionCommit(inner, effect);
          return new Ok("committed");
        }, outer);
        expect(effect).not.toHaveBeenCalled();
        return result;
      }, root);
      expect(result).toEqual(new Ok("committed"));
      expect(effect).not.toHaveBeenCalled();
    });
    expect(effect).toHaveBeenCalledOnce();
  });
});

describe("withTransaction savepoints", () => {
  it("rolls back committed descendants and suppresses their effects when an outer savepoint fails", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const first = await SkillFactory.create(auth, { name: "Outer skill" });
    const second = await SkillFactory.create(auth, { name: "Inner skill" });
    const effect = vi.fn(async () => {});
    const rollback = new Error("Outer savepoint rollback");

    await expect(
      withTransaction(
        async (outer) => {
          await first.archive(auth, { transaction: outer });
          await withTransaction(
            async (middle) => {
              await withTransaction(
                async (inner) => {
                  await second.archive(auth, { transaction: inner });
                  await runAfterTransactionCommit(inner, effect);
                },
                middle,
                { useSavepoint: true }
              );
              expect(effect).not.toHaveBeenCalled();
            },
            outer,
            { useSavepoint: true }
          );
          expect(effect).not.toHaveBeenCalled();
          throw rollback;
        },
        undefined,
        { useSavepoint: true }
      )
    ).rejects.toBe(rollback);

    // These tests keep real cache invalidation deferred by the test's outer transaction;
    // admin metadata reads isolate persisted state from the intentionally stale grant cache.
    const restored = await SkillResource.fetchByIds(
      auth,
      [first.sId, second.sId],
      {
        permissionFiltering: "redact_unreadable",
      }
    );
    expect(restored.map((skill) => skill.status)).toEqual(["active", "active"]);
    expect(effect).not.toHaveBeenCalled();
  });

  it("preserves earlier outer writes after an inner rollback and can create another savepoint", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const first = await SkillFactory.create(auth, { name: "Outer skill" });
    const second = await SkillFactory.create(auth, { name: "Inner skill" });
    const effect = vi.fn(async () => {});
    const rollback = new Error("Inner savepoint rollback");

    await withTransaction(
      async (outer) => {
        await first.archive(auth, { transaction: outer });
        await expect(
          withTransaction(
            async (inner) => {
              await second.archive(auth, { transaction: inner });
              await runAfterTransactionCommit(inner, effect);
              throw rollback;
            },
            outer,
            { useSavepoint: true }
          )
        ).rejects.toBe(rollback);
        const current = await SkillResource.fetchByIds(
          auth,
          [first.sId, second.sId],
          {
            permissionFiltering: "redact_unreadable",
          }
        );
        expect(
          new Map(current.map((skill) => [skill.sId, skill.status]))
        ).toEqual(
          new Map([
            [first.sId, "archived"],
            [second.sId, "active"],
          ])
        );

        await withTransaction(
          async (sibling) => {
            await second.archive(auth, { transaction: sibling });
          },
          outer,
          { useSavepoint: true }
        );
      },
      undefined,
      { useSavepoint: true }
    );

    const committed = await SkillResource.fetchByIds(
      auth,
      [first.sId, second.sId],
      {
        permissionFiltering: "redact_unreadable",
      }
    );
    expect(committed.map((skill) => skill.status)).toEqual([
      "archived",
      "archived",
    ]);
    expect(effect).not.toHaveBeenCalled();
  });

  it("runs descendant effects only after the root transaction commits", async () => {
    const effect = vi.fn(async () => {});
    await frontSequelize.transaction(async (root) => {
      await withTransaction(
        async (outer) => {
          await withTransaction(
            async (inner) => {
              await runAfterTransactionCommit(inner, effect);
            },
            outer,
            { useSavepoint: true }
          );
          expect(effect).not.toHaveBeenCalled();
        },
        root,
        { useSavepoint: true }
      );
      expect(effect).not.toHaveBeenCalled();
    });
    expect(effect).toHaveBeenCalledOnce();
  });
});

describe("runAfterTransactionCommit", () => {
  it("runs directly when no caller-owned transaction remains", async () => {
    const effect = vi.fn(async () => {});
    await runAfterTransactionCommit(undefined, effect);
    expect(effect).toHaveBeenCalledOnce();
  });

  it("waits for the outer commit even after a savepoint succeeds", async () => {
    const effect = vi.fn(async () => {});
    const invalidate = vi.fn(async () => {});
    await frontSequelize.transaction(async (outer) => {
      await frontSequelize.transaction(
        { transaction: outer },
        async (inner) => {
          await runAfterTransactionCommit(inner, effect);
          invalidateCacheAfterCommit(inner, invalidate);
          expect(effect).not.toHaveBeenCalled();
        }
      );
      expect(effect).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    });
    expect(effect).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("does not run after a rolled-back savepoint or outer transaction", async () => {
    const effect = vi.fn(async () => {});
    await frontSequelize.transaction(async (outer) => {
      const inner = await frontSequelize.transaction({ transaction: outer });
      await runAfterTransactionCommit(inner, effect);
      await inner.rollback();
    });
    expect(effect).not.toHaveBeenCalled();

    const outer = await frontSequelize.transaction();
    await frontSequelize.transaction({ transaction: outer }, async (inner) => {
      await runAfterTransactionCommit(inner, effect);
    });
    await outer.rollback();
    expect(effect).not.toHaveBeenCalled();
  });
});
