// HTTP client for the Hive control plane. The CLI is its first client; it never
// calls Blaxel directly for fleet operations — only the control plane.

import { z } from "zod";
import { getConfigVar } from "./config-env";
import { CommandError, Err, Ok, type Result } from "./result";

const DEFAULT_URL = "http://localhost:4000";

const RemoteBeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  sandboxId: z.string().nullable(),
  previewUrl: z.string().nullable(),
  hostState: z.enum(["provisioning", "ready", "reclaimed"]),
  scenario: z.string().optional(),
  createdAt: z.string(),
});
export type RemoteBee = z.infer<typeof RemoteBeeSchema>;

const ConnectResultSchema = z.object({
  previewToken: z.string(),
  sessionToken: z.string(),
  previewUrl: z.string(),
  sandboxId: z.string(),
});
export type ConnectResult = z.infer<typeof ConnectResultSchema>;

const ErrorEnvelopeSchema = z.object({
  error: z.object({ kind: z.string(), message: z.string() }),
});

interface ClientConfig {
  baseUrl: string;
  token: string;
}

async function loadClientConfig(): Promise<Result<ClientConfig>> {
  const token = await getConfigVar("HIVE_CP_TOKEN");
  if (!token) {
    return Err(
      new CommandError(
        "No control-plane credentials. Run: dust-hive env set HIVE_CP_TOKEN <token> (and optionally HIVE_CP_URL)."
      )
    );
  }
  const baseUrl = (await getConfigVar("HIVE_CP_URL")) ?? DEFAULT_URL;
  return Ok({ baseUrl: baseUrl.replace(/\/$/, ""), token });
}

async function errorFromResponse(res: Response): Promise<CommandError> {
  const parsed = ErrorEnvelopeSchema.safeParse(await res.json().catch(() => null));
  if (parsed.success) {
    return new CommandError(`control plane: ${parsed.data.error.message} (${res.status})`);
  }
  return new CommandError(`control plane returned ${res.status}`);
}

export class ControlPlaneClient {
  private constructor(private readonly config: ClientConfig) {}

  static async create(): Promise<Result<ControlPlaneClient>> {
    const config = await loadClientConfig();
    if (!config.ok) {
      return config;
    }
    return Ok(new ControlPlaneClient(config.value));
  }

  private async request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown
  ): Promise<Result<T>> {
    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.config.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Err(
        new CommandError(`Cannot reach control plane at ${this.config.baseUrl}: ${message}`)
      );
    }

    if (!res.ok) {
      return Err(await errorFromResponse(res));
    }
    const payload = res.status === 204 ? undefined : await res.json().catch(() => null);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return Err(new CommandError("Unexpected control-plane response shape"));
    }
    return Ok(parsed.data);
  }

  listBees(): Promise<Result<RemoteBee[]>> {
    return this.request("GET", "/bees", z.array(RemoteBeeSchema));
  }

  provisionBee(name: string, scenario?: string): Promise<Result<RemoteBee>> {
    return this.request("POST", "/bees", RemoteBeeSchema, {
      name,
      ...(scenario ? { scenario } : {}),
    });
  }

  connect(id: string): Promise<Result<ConnectResult>> {
    return this.request("POST", `/bees/${id}/connect`, ConnectResultSchema);
  }

  reclaim(id: string): Promise<Result<void>> {
    return this.request("DELETE", `/bees/${id}`, z.undefined());
  }

  // The CLI addresses bees by name; per-bee control-plane calls key on id.
  async resolveBee(name: string): Promise<Result<RemoteBee>> {
    const bees = await this.listBees();
    if (!bees.ok) {
      return bees;
    }
    const bee = bees.value.find((b) => b.name === name);
    if (!bee) {
      return Err(
        new CommandError(
          `No remote bee named '${name}'. Create one with: dust-hive spawn --remote ${name}`
        )
      );
    }
    return Ok(bee);
  }
}
