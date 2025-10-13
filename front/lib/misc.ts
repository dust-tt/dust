import { hash as blake3 } from "blake3";

import type { LightWorkspaceType } from "@app/types";

// Check this slack thread for more details: https://dust4ai.slack.com/archives/C050SM8NSPK/p1750433286397399.
// Any change to this function should be reviewed by @spolu.
export const isWorkspaceUsingStaticIP = (workspace: LightWorkspaceType) =>
  blake3(workspace.sId).toString("hex") ===
  "5e6faccb8b7e2be7cab0a46a1376126b75032acbfbd5c723d9b0f0b38a73b334";
