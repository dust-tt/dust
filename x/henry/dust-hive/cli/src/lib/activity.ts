// Track last-interacted environment for interactive selection
// File: ~/.dust-hive/activity.json

import { z } from "zod";
import { createTypeGuard } from "./errors";
import { ACTIVITY_PATH } from "./paths";

const ActivityStateSchema = z.object({
  lastEnv: z.string(),
  updatedAt: z.string(),
});

type ActivityState = z.infer<typeof ActivityStateSchema>;

const isActivityState = createTypeGuard<ActivityState>(ActivityStateSchema);

export async function getLastActiveEnv(): Promise<string | null> {
  const file = Bun.file(ACTIVITY_PATH);

  if (!(await file.exists())) {
    return null;
  }

  const data: unknown = await file.json();
  if (!isActivityState(data)) {
    return null;
  }

  return data.lastEnv;
}

export async function setLastActiveEnv(name: string): Promise<void> {
  const state: ActivityState = {
    lastEnv: name,
    updatedAt: new Date().toISOString(),
  };
  await Bun.write(ACTIVITY_PATH, JSON.stringify(state, null, 2));
}
