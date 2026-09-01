import type { LockLeaseGuard } from "@app/lib/lock";
import { Ok } from "@app/types/shared/result";

export function makeAlwaysHeldLockLease(): LockLeaseGuard {
  return { check: () => new Ok(undefined) };
}
