import { getSandbox } from "@cloudflare/sandbox";

export { Sandbox } from "@cloudflare/sandbox";

type JsonRecord = Record<string, unknown>;

interface Env {
  Sandbox: DurableObjectNamespace;
  BENCH_REGISTRY: DurableObjectNamespace;
  BENCH_PLAN?: string;
  BENCH_TOKEN?: string;
}

function json(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function badRequest(msg: string): Response {
  return new Response(msg, { status: 400 });
}

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function checkAuth(request: Request, env: Env): Response | null {
  if (!env.BENCH_TOKEN) {
    return null;
  }
  const header = request.headers.get("authorization");
  if (header !== `Bearer ${env.BENCH_TOKEN}`) {
    return unauthorized();
  }
  return null;
}

function getRegistryStub(env: Env): DurableObjectStub {
  const id = env.BENCH_REGISTRY.idFromName("default");
  return env.BENCH_REGISTRY.get(id);
}

async function registryAdd(env: Env, sandboxId: string): Promise<void> {
  const stub = getRegistryStub(env);
  await stub.fetch("https://bench-registry/add", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sandboxId }),
  });
}

async function registryRemove(env: Env, sandboxId: string): Promise<void> {
  const stub = getRegistryStub(env);
  await stub.fetch("https://bench-registry/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sandboxId }),
  });
}

async function registryList(env: Env): Promise<string[]> {
  const stub = getRegistryStub(env);
  const res = await stub.fetch("https://bench-registry/list");
  if (!res.ok) {
    throw new Error(`registry list failed: ${res.status}`);
  }
  const body = (await res.json()) as { sandboxIds: string[] };
  return body.sandboxIds ?? [];
}

async function registryClear(env: Env): Promise<void> {
  const stub = getRegistryStub(env);
  await stub.fetch("https://bench-registry/clear", { method: "POST" });
}

async function destroySandbox(env: Env, sandboxId: string): Promise<void> {
  const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });
  await sandbox.destroy();
}

async function readJson(request: Request): Promise<JsonRecord> {
  try {
    return (await request.json()) as JsonRecord;
  } catch {
    return {};
  }
}

function requireString(body: JsonRecord, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  return value;
}

function requireNumber(body: JsonRecord, key: string): number | null {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function checkPlan(env: Env, plan: string): Response | null {
  if (env.BENCH_PLAN && env.BENCH_PLAN !== plan) {
    return badRequest(
      `plan mismatch: worker BENCH_PLAN=${env.BENCH_PLAN}, request plan=${plan}`,
    );
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authErr = checkAuth(request, env);
    if (authErr) {
      return authErr;
    }

    const url = new URL(request.url);

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/bench/create") {
      const body = await readJson(request);
      const plan = requireString(body, "plan");
      const sandboxId = requireString(body, "sandboxId");
      if (!plan || !sandboxId) {
        return badRequest("Missing plan or sandboxId");
      }
      const planErr = checkPlan(env, plan);
      if (planErr) {
        return planErr;
      }

      await registryAdd(env, sandboxId);
      // Note: getSandbox() is lazy; actual container provisioning typically happens on first exec().
      getSandbox(env.Sandbox, sandboxId, { normalizeId: true });

      return json(200, { ok: true });
    }

    if (url.pathname === "/bench/exec-ready") {
      const body = await readJson(request);
      const plan = requireString(body, "plan");
      const sandboxId = requireString(body, "sandboxId");
      if (!plan || !sandboxId) {
        return badRequest("Missing plan or sandboxId");
      }
      const planErr = checkPlan(env, plan);
      if (planErr) {
        return planErr;
      }

      const hardTimeoutMs = requireNumber(body, "hardTimeoutMs") ?? 60_000;
      const attemptTimeoutMs = requireNumber(body, "attemptTimeoutMs") ?? 5_000;
      const retryDelayMs = requireNumber(body, "retryDelayMs") ?? 500;

      const sandbox = getSandbox(env.Sandbox, sandboxId, { normalizeId: true });

      const hardDeadline = Date.now() + hardTimeoutMs;
      let attempts = 0;
      let lastError = "";

      while (Date.now() < hardDeadline) {
        attempts++;
        try {
          const result = await sandbox.exec('bash -c "echo i_am_online"', {
            timeout: attemptTimeoutMs,
          });

          if (result.success && result.stdout.includes("i_am_online")) {
            return json(200, { ok: true, attempts });
          }

          lastError =
            (result.stderr && result.stderr.trim()) ||
            (result.stdout && result.stdout.trim()) ||
            `exitCode=${result.exitCode}`;
        } catch (err) {
          lastError = normalizeErrorMessage(err);
        }

        if (Date.now() < hardDeadline) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      return json(200, { ok: false, attempts, lastError });
    }

    if (url.pathname === "/bench/delete") {
      const body = await readJson(request);
      const plan = requireString(body, "plan");
      const sandboxId = requireString(body, "sandboxId");
      if (!plan || !sandboxId) {
        return badRequest("Missing plan or sandboxId");
      }
      const planErr = checkPlan(env, plan);
      if (planErr) {
        return planErr;
      }

      await destroySandbox(env, sandboxId).catch(() => {});
      await registryRemove(env, sandboxId).catch(() => {});

      return json(200, { ok: true });
    }

    if (url.pathname === "/bench/cleanup") {
      const body = await readJson(request);
      const plan = requireString(body, "plan");
      if (!plan) {
        return badRequest("Missing plan");
      }
      const planErr = checkPlan(env, plan);
      if (planErr) {
        return planErr;
      }

      const sandboxIds = await registryList(env).catch(() => []);
      for (const sandboxId of sandboxIds) {
        await destroySandbox(env, sandboxId).catch(() => {});
      }
      await registryClear(env).catch(() => {});

      return json(200, { ok: true, destroyed: sandboxIds.length });
    }

    return new Response("Not Found", { status: 404 });
  },
};

export class BenchRegistry {
  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/add") {
      const body = (await readJson(request)) as JsonRecord;
      const sandboxId = requireString(body, "sandboxId");
      if (!sandboxId) {
        return badRequest("Missing sandboxId");
      }
      await this.state.storage.put(`s:${sandboxId}`, 1);
      return json(200, { ok: true });
    }

    if (url.pathname === "/remove") {
      const body = (await readJson(request)) as JsonRecord;
      const sandboxId = requireString(body, "sandboxId");
      if (!sandboxId) {
        return badRequest("Missing sandboxId");
      }
      await this.state.storage.delete(`s:${sandboxId}`);
      return json(200, { ok: true });
    }

    if (url.pathname === "/list") {
      const entries = await this.state.storage.list<number>({ prefix: "s:" });
      const sandboxIds = Array.from(entries.keys()).map((k) => k.slice("s:".length));
      return json(200, { sandboxIds });
    }

    if (url.pathname === "/clear") {
      const entries = await this.state.storage.list<number>({ prefix: "s:" });
      const keys = Array.from(entries.keys());
      if (keys.length) {
        await this.state.storage.delete(keys);
      }
      return json(200, { ok: true });
    }

    return new Response("Not Found", { status: 404 });
  }
}
