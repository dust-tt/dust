// Remote host management - CRUD operations for registered remote hosts

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { createTypeGuard } from "./errors";
import { DUST_HIVE_HOME } from "./paths";

// Path to remotes configuration file
export const REMOTES_PATH = `${DUST_HIVE_HOME}/remotes.json`;

// Remote host schema - currently only GCP IAP is supported
const RemoteHostSchema = z.object({
  name: z.string(),
  type: z.literal("gcp-iap"),
  project: z.string(),
  zone: z.string(),
  instance: z.string(),
  remoteUser: z.string(),
  localUser: z.string(),
});

export type RemoteHost = z.infer<typeof RemoteHostSchema>;

const RemotesConfigSchema = z.object({
  remotes: z.array(RemoteHostSchema),
});

type RemotesConfig = z.infer<typeof RemotesConfigSchema>;

export const isRemoteHost = createTypeGuard<RemoteHost>(RemoteHostSchema);

// Validate remote host name
export function validateRemoteName(name: string): { valid: boolean; error?: string } {
  if (!name) {
    return { valid: false, error: "Name is required" };
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return {
      valid: false,
      error:
        "Name must start with a letter and contain only lowercase letters, numbers, and hyphens",
    };
  }

  if (name.length > 20) {
    return { valid: false, error: "Name must be 20 characters or less" };
  }

  return { valid: true };
}

// Load all remote hosts
export async function loadRemotes(): Promise<RemoteHost[]> {
  const file = Bun.file(REMOTES_PATH);
  if (!(await file.exists())) {
    return [];
  }

  try {
    const data: unknown = await file.json();
    const parsed = RemotesConfigSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data.remotes;
    }
    return [];
  } catch {
    return [];
  }
}

// Save all remote hosts
async function saveRemotes(remotes: RemoteHost[]): Promise<void> {
  await mkdir(dirname(REMOTES_PATH), { recursive: true });
  const config: RemotesConfig = { remotes };
  await Bun.write(REMOTES_PATH, JSON.stringify(config, null, 2));
}

// Get a remote host by name
export async function getRemoteHost(name: string): Promise<RemoteHost | null> {
  const remotes = await loadRemotes();
  return remotes.find((r) => r.name === name) ?? null;
}

// Check if a remote host exists
export async function remoteHostExists(name: string): Promise<boolean> {
  const remote = await getRemoteHost(name);
  return remote !== null;
}

// Add a new remote host
export async function addRemoteHost(host: RemoteHost): Promise<void> {
  const remotes = await loadRemotes();

  // Check for duplicate name
  if (remotes.some((r) => r.name === host.name)) {
    throw new Error(`Remote host '${host.name}' already exists`);
  }

  remotes.push(host);
  await saveRemotes(remotes);
}

// Remove a remote host by name
export async function removeRemoteHost(name: string): Promise<boolean> {
  const remotes = await loadRemotes();
  const index = remotes.findIndex((r) => r.name === name);

  if (index === -1) {
    return false;
  }

  remotes.splice(index, 1);
  await saveRemotes(remotes);
  return true;
}

// Update a remote host
export async function updateRemoteHost(name: string, updates: Partial<RemoteHost>): Promise<void> {
  const remotes = await loadRemotes();
  const index = remotes.findIndex((r) => r.name === name);

  if (index === -1) {
    throw new Error(`Remote host '${name}' not found`);
  }

  const existing = remotes[index];
  if (!existing) {
    throw new Error(`Remote host '${name}' not found`);
  }

  remotes[index] = {
    name: updates.name ?? existing.name,
    type: updates.type ?? existing.type,
    project: updates.project ?? existing.project,
    zone: updates.zone ?? existing.zone,
    instance: updates.instance ?? existing.instance,
    remoteUser: updates.remoteUser ?? existing.remoteUser,
    localUser: updates.localUser ?? existing.localUser,
  };
  await saveRemotes(remotes);
}

// List all remote host names
export async function listRemoteHosts(): Promise<string[]> {
  const remotes = await loadRemotes();
  return remotes.map((r) => r.name).sort();
}
