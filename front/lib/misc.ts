import type { LightWorkspaceType } from "@app/types/user";
import { createHash } from "crypto";

// Check this slack thread for more details: https://dust4ai.slack.com/archives/C050SM8NSPK/p1750433286397399.
// Any change to this function should be reviewed by @spolu.
// Note: the hardcoded value is sha256(<workspace_sId>) for the workspace using static IP.
export const isWorkspaceUsingStaticIP = (workspace: LightWorkspaceType) =>
  createHash("sha256").update(workspace.sId).digest("hex") ===
  "5e6faccb8b7e2be7cab0a46a1376126b75032acbfbd5c723d9b0f0b38a73b334";
