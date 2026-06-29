import { z } from "zod";

// Three-layer state model (design §State model), reported separately so a
// client can tell *what* is wrong.

// Host state — control-plane-authoritative. A scaled-to-zero bee has no live
// PIDs to derive from, so the control plane owns this.
export const HostStateSchema = z.enum(["provisioning", "ready", "reclaimed"]);
export type HostState = z.infer<typeof HostStateSchema>;

// Env state — in-bee, derived live by dust-hive when the bee is awake.
export const EnvStateSchema = z.enum(["stopped", "cold", "warm", "unknown"]);
export type EnvState = z.infer<typeof EnvStateSchema>;

// Agent state — in-bee supervisor. Drives keepalive (M4) and distinguishes
// "agent working" from "agent died".
export const AgentStateSchema = z.enum(["idle", "busy", "crashed", "unknown"]);
export type AgentState = z.infer<typeof AgentStateSchema>;

// A bee is user-owned and long-lived: it belongs to an identity, persists
// across sessions, and is addressed by its owner-unique name.
export const BeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  // Blaxel sandbox id — null between registry creation and sandbox create.
  sandboxId: z.string().nullable(),
  previewUrl: z.string().nullable(),
  hostState: HostStateSchema,
  // The Tier-A seed scenario the bee carries, recorded for reproducibility.
  scenario: z.string().optional(),
  createdAt: z.string(),
});
export type Bee = z.infer<typeof BeeSchema>;

// Bee name rules mirror the CLI's env name validation so a name is portable
// between local and remote.
const BEE_NAME_RE = /^[a-z][a-z0-9-]*$/;

export function validateBeeName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Name is required" };
  }
  if (!BEE_NAME_RE.test(name)) {
    return {
      valid: false,
      error:
        "Name must start with a letter and contain only lowercase letters, numbers, and hyphens",
    };
  }
  if (name.length > 26) {
    return { valid: false, error: "Name must be 26 characters or less" };
  }
  return { valid: true };
}
