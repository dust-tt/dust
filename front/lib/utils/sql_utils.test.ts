import { frontSequelize } from "@app/lib/resources/storage";
import { invalidateCacheAfterCommit } from "@app/lib/utils/cache";
import {
  runAfterTransactionCommit,
  withTransaction,
  withTransactionResult,
} from "@app/lib/utils/sql_utils";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/utils/cache");

describe("withTransactionResult", () => {
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
