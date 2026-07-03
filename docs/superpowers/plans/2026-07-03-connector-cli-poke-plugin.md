# Connector CLI Poke Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Poke plugin, "Run Connector CLI Command", that auto-exposes every connectors admin CLI command via a live catalog and a dedicated dynamic form (pick group → subcommand → params → run).

**Architecture:** Connectors exposes a side-effect-free Commander program builder, a read-only catalog endpoint (introspecting the zod command schema for structure + Commander for param metadata), and a non-whitelisted run endpoint. Front adds a `global` plugin whose static 3-field manifest satisfies the run endpoint, a dedicated form that fetches the catalog and posts the assembled command, and a `ConnectorsAPI` passthrough.

**Tech Stack:** TypeScript, zod, Commander v9.5.0 (connectors), Next/Hono + React + SWR + Sparkle (front), vitest v4.

## Global Constraints

- No `console.*` — use the app `logger` ([GEN8]).
- No non-type-safe `as` ([GEN4]); no io-ts in new code, use zod ([GEN13]).
- Errors via `Result<>` / `Ok`/`Err`; caught errors via `normalizeError` ([ERR1]/[ERR2]).
- No env access via `process.env`; use `@app/lib/api/config` on front ([GEN11]).
- Exhaustive `switch` + `assertNever`/`assertNeverAndIgnore` over union `if/else` ([GEN6]); frontend uses `assertNeverAndIgnore` ([REACT5]).
- React: props typed via `interface` ([REACT1]); network ops in SWR hooks ([REACT2]); async ops show a loading state ([REACT3]); hooks in conditionally-visible components take a `disabled` flag ([REACT2]).
- Named constants, not magic values; comment only non-obvious logic; wrap ~100 cols.
- Plugin id (used verbatim in code and the dialog branch): `run-connector-cli-command`.
- Plugin `requiredRoles`: `["engineering"]`.
- Security (approved Option A): the connectors run endpoint used by this plugin validates against `AdminCommandSchema` but is NOT whitelist-gated. The existing whitelisted `/connectors/admin` stays unchanged.

---

## File Structure

Connectors:
- `connectors/src/admin/cli_program.ts` (new) — `buildAdminProgram(): Command`.
- `connectors/src/admin/cli.ts` (modify) — use the builder; keep `parseAsync`.
- `connectors/src/types/admin/catalog.ts` (new) — zod `CliCommandCatalogSchema` + types.
- `connectors/src/lib/admin/catalog.ts` (new) — `buildCliCommandCatalog(program)`.
- `connectors/src/lib/admin/catalog.test.ts` (new) — unit test.
- `connectors/src/api/admin.ts` (modify) — `adminCatalogAPIHandler` (GET) + `adminRunAPIHandler` (POST, no whitelist).
- `connectors/src/api_server.ts` (modify) — register the two routes.
- `connectors/src/types/index.ts` (modify) — barrel-export catalog types.

Front:
- `front/types/connectors/admin/catalog.ts` (new) — front-side zod `CliCommandCatalogSchema` + types (mirror).
- `front/types/connectors/connectors_api.ts` (modify) — `getAdminCliCatalog()`, `adminRun()`.
- `front/types/api/poke/connectors/cli_catalog.ts` (new) — response body type.
- `front-api/routes/poke/connectors/cli-catalog.ts` (new) — catalog proxy route.
- `front-api/routes/poke/connectors/index.ts` (modify) — mount the route.
- `front/poke/swr/plugins.ts` (modify) — `usePokeConnectorCliCatalog()`.
- `front/lib/api/poke/plugins/global/run_connector_cli_command.ts` (new) + `global/index.ts` (modify).
- `front/lib/api/poke/plugins/global/args_json.ts` (new) — pure `buildAdminRunArgs()` helper.
- `front/lib/api/poke/plugins/global/args_json.test.ts` (new) — unit test.
- `front/components/poke/plugins/ConnectorCliCommandForm.tsx` (new).
- `front/components/poke/plugins/RunPluginDialog.tsx` (modify) — branch to the dedicated form by plugin id.

Shared catalog shape (defined identically on both sides, per the existing mirror pattern):

```ts
type CliCommandOption = { name: string; description: string; isNumber: boolean };
type CliCommandGroup = {
  majorCommand: string;
  description: string;
  subcommands: string[];
  options: CliCommandOption[];
};
type CliCommandCatalog = { groups: CliCommandGroup[] };
```

---

## Task 1: Connectors — side-effect-free Commander program builder

**Files:**
- Create: `connectors/src/admin/cli_program.ts`
- Modify: `connectors/src/admin/cli.ts`

**Interfaces:**
- Produces: `buildAdminProgram(): Command` — returns a fully-configured Commander program WITHOUT parsing argv. Consumed by Task 3 (catalog handler) and Task 2's test.

- [ ] **Step 1: Create the builder by moving program construction out of `cli.ts`**

Create `connectors/src/admin/cli_program.ts`. Move the entire program construction from `cli.ts` (the `const program = new Command()` block and every `program.command(...)....action(...)` chain, lines 32–472) into a function. Keep the `dispatch(...)` helper and its imports here too, since the `.action()` callbacks call it.

```ts
import { Argument, Command } from "@commander-js/extra-typings";
import { AdminCommandSchema } from "@connectors/types";
import { fromError } from "zod-validation-error";

async function dispatch(
  majorCommand: string,
  subcommand: string,
  opts: Record<string, unknown>
): Promise<void> {
  const validation = AdminCommandSchema.safeParse({
    majorCommand,
    command: subcommand,
    args: opts,
  });
  if (!validation.success) {
    // eslint-disable-next-line no-console -- CLI user-facing output.
    console.error(
      `\x1b[31mError: ${fromError(validation.error).toString()}\x1b[0m`
    );
    process.exit(1);
  }

  // Dynamic import: defers loading all connector code until a command is
  // dispatched. A static import loads every connector on every invocation,
  // including --help and catalog introspection.
  const { runCommand } = await import("@connectors/lib/cli");
  const result = await runCommand(validation.data);
  // eslint-disable-next-line no-console -- CLI user-facing output.
  console.log(JSON.stringify(result, null, 2));
  // eslint-disable-next-line no-console -- CLI user-facing output.
  console.error("\x1b[32mDone\x1b[0m");
}

export function buildAdminProgram(): Command {
  const program = new Command();
  program
    .name("cli")
    .description("Admin CLI for connectors")
    .addHelpCommand(false);

  // ... MOVE every `program.command("batch")...` through
  // `program.command("zendesk")....action(...)` block here verbatim ...

  return program;
}
```

Note: the existing `cli.ts` already uses `console.*` for CLI output. Preserve that behavior in the builder (this is legitimate CLI stdout, not app logging); keep/add the `eslint-disable` lines as shown so lint passes.

- [ ] **Step 2: Reduce `cli.ts` to entry-point wiring**

Replace the body of `connectors/src/admin/cli.ts` with:

```ts
import { buildAdminProgram } from "@connectors/admin/cli_program";

process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

const program = buildAdminProgram();

program.parseAsync(process.argv).catch((err: Error) => {
  // eslint-disable-next-line no-console -- CLI user-facing output.
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
```

- [ ] **Step 3: Verify the CLI still works and typechecks**

Run: `cd connectors && npx tsx src/admin/cli.ts` (no args)
Expected: Commander prints usage/help for the `cli` program and exits (non-crash). Then:
Run: `cd connectors && npm run tsgo -- --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add connectors/src/admin/cli_program.ts connectors/src/admin/cli.ts
git commit -m "refactor(connectors): extract side-effect-free admin CLI program builder"
```

---

## Task 2: Connectors — catalog types + introspection helper

**Files:**
- Create: `connectors/src/types/admin/catalog.ts`
- Create: `connectors/src/lib/admin/catalog.ts`
- Create: `connectors/src/lib/admin/catalog.test.ts`
- Modify: `connectors/src/types/index.ts`

**Interfaces:**
- Consumes: `buildAdminProgram()` (Task 1); `AdminCommandSchema` (`@connectors/types`).
- Produces:
  - `CliCommandCatalogSchema` (zod), types `CliCommandCatalog`, `CliCommandGroup`, `CliCommandOption`.
  - `buildCliCommandCatalog(program: Command): CliCommandCatalog`.

- [ ] **Step 1: Define the catalog zod schema**

Create `connectors/src/types/admin/catalog.ts`:

```ts
import { z } from "zod";

export const CliCommandOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  isNumber: z.boolean(),
});
export type CliCommandOption = z.infer<typeof CliCommandOptionSchema>;

export const CliCommandGroupSchema = z.object({
  majorCommand: z.string(),
  description: z.string(),
  subcommands: z.array(z.string()),
  options: z.array(CliCommandOptionSchema),
});
export type CliCommandGroup = z.infer<typeof CliCommandGroupSchema>;

export const CliCommandCatalogSchema = z.object({
  groups: z.array(CliCommandGroupSchema),
});
export type CliCommandCatalog = z.infer<typeof CliCommandCatalogSchema>;
```

Add to `connectors/src/types/index.ts` (after the existing `export * from "./admin/cli";`):

```ts
export * from "./admin/catalog";
```

- [ ] **Step 2: Write the failing test for `buildCliCommandCatalog`**

Create `connectors/src/lib/admin/catalog.test.ts`:

```ts
import { buildAdminProgram } from "@connectors/admin/cli_program";
import { buildCliCommandCatalog } from "@connectors/lib/admin/catalog";
import { describe, expect, it } from "vitest";

describe("buildCliCommandCatalog", () => {
  const catalog = buildCliCommandCatalog(buildAdminProgram());

  it("includes every command group with a description", () => {
    const names = catalog.groups.map((g) => g.majorCommand);
    // Spot-check a few groups across typed and record-arg schemas.
    expect(names).toContain("slack");
    expect(names).toContain("gong");
    expect(names).toContain("connectors");
    for (const group of catalog.groups) {
      expect(group.description.length).toBeGreaterThan(0);
    }
  });

  it("lists subcommands from the zod schema", () => {
    const slack = catalog.groups.find((g) => g.majorCommand === "slack");
    expect(slack?.subcommands).toContain("check-channel");
    expect(slack?.subcommands).toContain("skip-channel");
  });

  it("lists param options with descriptions and number hints", () => {
    const gong = catalog.groups.find((g) => g.majorCommand === "gong");
    const connectorId = gong?.options.find((o) => o.name === "connectorId");
    // gong declares --connectorId with parseInt.
    expect(connectorId?.isNumber).toBe(true);
    expect(connectorId?.description.length).toBeGreaterThan(0);

    const callId = gong?.options.find((o) => o.name === "callId");
    expect(callId?.isNumber).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd connectors && npx vitest run src/lib/admin/catalog.test.ts`
Expected: FAIL — `buildCliCommandCatalog` is not defined / module not found.

- [ ] **Step 4: Implement `buildCliCommandCatalog`**

Create `connectors/src/lib/admin/catalog.ts`. Structure (groups + subcommands) comes from the authoritative zod `AdminCommandSchema`; param metadata (names, descriptions, number hints) comes from the Commander program (public `cmd.options`). `opt.parseArg` is `parseInt` exactly when the CLI declared the option with `parseInt` as its coercion function.

```ts
import type { Command } from "@commander-js/extra-typings";
import { AdminCommandSchema } from "@connectors/types";
import type {
  CliCommandCatalog,
  CliCommandOption,
} from "@connectors/types";

export function buildCliCommandCatalog(program: Command): CliCommandCatalog {
  // Param metadata from Commander (public option API). Keyed by group name.
  const descriptionByGroup = new Map<string, string>();
  const optionsByGroup = new Map<string, CliCommandOption[]>();

  for (const cmd of program.commands) {
    descriptionByGroup.set(cmd.name(), cmd.description());
    optionsByGroup.set(
      cmd.name(),
      cmd.options.map((opt) => ({
        // Every admin option declares a long flag (e.g. "--connectorId").
        name: (opt.long ?? "").replace(/^--/, ""),
        description: opt.description,
        // Options declared with `parseInt` as their coercion are numeric.
        isNumber: opt.parseArg === parseInt,
      }))
    );
  }

  // Structure from the authoritative zod discriminated union. Each member's
  // `command` field is a union of literals (every group has >= 2 subcommands).
  const groups = AdminCommandSchema.options.map((member) => {
    const majorCommand = member.shape.majorCommand.value;
    const subcommands = member.shape.command.options.map((lit) => lit.value);

    return {
      majorCommand,
      description: descriptionByGroup.get(majorCommand) ?? "",
      subcommands,
      options: optionsByGroup.get(majorCommand) ?? [],
    };
  });

  return { groups };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd connectors && npx vitest run src/lib/admin/catalog.test.ts`
Expected: PASS (3 tests). Then `cd connectors && npm run tsgo -- --noEmit` → no type errors.

If TypeScript rejects `member.shape.command.options` (union narrowing), it means a group declared `command` as a single `z.literal` rather than a union. Handle both by extracting literals defensively:

```ts
const commandSchema = member.shape.command;
const subcommands =
  "options" in commandSchema
    ? commandSchema.options.map((lit) => lit.value)
    : [commandSchema.value];
```

- [ ] **Step 6: Commit**

```bash
git add connectors/src/types/admin/catalog.ts connectors/src/types/index.ts \
  connectors/src/lib/admin/catalog.ts connectors/src/lib/admin/catalog.test.ts
git commit -m "feat(connectors): add admin CLI command catalog introspection"
```

---

## Task 3: Connectors — catalog + non-whitelisted run endpoints

**Files:**
- Modify: `connectors/src/api/admin.ts`
- Modify: `connectors/src/api_server.ts`

**Interfaces:**
- Consumes: `buildAdminProgram()` (Task 1), `buildCliCommandCatalog()` (Task 2), `AdminCommandSchema`, `runCommand` (`@connectors/lib/cli`).
- Produces (HTTP, both behind the existing `authMiddleware`):
  - `GET /connectors/admin/catalog` → `CliCommandCatalog` JSON.
  - `POST /connectors/admin/run` → runs any `AdminCommandSchema`-valid command (no whitelist), returns `AdminResponseType` JSON.

- [ ] **Step 1: Add the two handlers to `connectors/src/api/admin.ts`**

Add these imports at the top (keep existing imports):

```ts
import { buildAdminProgram } from "@connectors/admin/cli_program";
import { buildCliCommandCatalog } from "@connectors/lib/admin/catalog";
import type { CliCommandCatalog } from "@connectors/types";
```

Append the handlers (leave the existing `adminAPIHandler` and its whitelist untouched):

```ts
const _adminCatalogAPIHandler = async (
  _req: Request,
  res: Response<WithConnectorsAPIErrorReponse<CliCommandCatalog>>
) => {
  // Building the program is cheap (no argv parsing, no connector code loaded).
  const catalog = buildCliCommandCatalog(buildAdminProgram());
  return res.json(catalog);
};

export const adminCatalogAPIHandler = withLogging(_adminCatalogAPIHandler);

// Runs any command that validates against AdminCommandSchema, WITHOUT the
// interactive whitelist. Used by the Poke "Run Connector CLI Command" plugin,
// which is gated at the front layer by super-user + engineering role. The
// whitelisted `adminAPIHandler` above stays the entry point for other callers.
const _adminRunAPIHandler = async (
  req: Request<Record<string, string>, AdminResponseType, AdminCommandType>,
  res: Response<WithConnectorsAPIErrorReponse<AdminResponseType>>
) => {
  const adminCommandValidation = AdminCommandSchema.safeParse(req.body);
  if (!adminCommandValidation.success) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(adminCommandValidation.error).toString()}`,
      },
      status_code: 400,
    });
  }

  const result = await runCommand(adminCommandValidation.data);
  return res.json(result);
};

export const adminRunAPIHandler = withLogging(_adminRunAPIHandler);
```

- [ ] **Step 2: Register the routes in `connectors/src/api_server.ts`**

Update the import on line 1 and add registrations next to the existing admin route (line ~205):

```ts
import {
  adminAPIHandler,
  adminCatalogAPIHandler,
  adminRunAPIHandler,
} from "@connectors/api/admin";
```

```ts
app.post("/connectors/admin", adminAPIHandler);
app.get("/connectors/admin/catalog", adminCatalogAPIHandler);
app.post("/connectors/admin/run", adminRunAPIHandler);
```

- [ ] **Step 3: Typecheck**

Run: `cd connectors && npm run tsgo -- --noEmit`
Expected: no type errors.

- [ ] **Step 4: Smoke-test the catalog endpoint locally**

Start connectors locally (per repo dev setup), then:
Run: `curl -s -H "Authorization: Bearer $DUST_CONNECTORS_SECRET" http://localhost:3002/connectors/admin/catalog | head -c 400`
(Use the connectors port/secret from your `.env.agent.local`.)
Expected: JSON beginning `{"groups":[{"majorCommand":...`. If you cannot run the service, rely on the Task 2 unit test (which covers the introspection logic) plus typecheck, and verify end-to-end in Task 8.

- [ ] **Step 5: Commit**

```bash
git add connectors/src/api/admin.ts connectors/src/api_server.ts
git commit -m "feat(connectors): add admin catalog and non-whitelisted run endpoints"
```

---

## Task 4: Front — catalog type + ConnectorsAPI methods

**Files:**
- Create: `front/types/connectors/admin/catalog.ts`
- Modify: `front/types/connectors/connectors_api.ts`

**Interfaces:**
- Produces:
  - `CliCommandCatalog`, `CliCommandGroup`, `CliCommandOption` (front-side, zod).
  - `ConnectorsAPI.getAdminCliCatalog(): Promise<ConnectorsAPIResponse<CliCommandCatalog>>`.
  - `ConnectorsAPI.adminRun(command: { majorCommand: string; command: string; args: Record<string, unknown> }): Promise<ConnectorsAPIResponse<AdminResponseType>>`.

- [ ] **Step 1: Define the front-side catalog schema (mirror)**

Create `front/types/connectors/admin/catalog.ts` (identical shape to the connectors side; new code so zod per [GEN13]):

```ts
import { z } from "zod";

export const CliCommandOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  isNumber: z.boolean(),
});
export type CliCommandOption = z.infer<typeof CliCommandOptionSchema>;

export const CliCommandGroupSchema = z.object({
  majorCommand: z.string(),
  description: z.string(),
  subcommands: z.array(z.string()),
  options: z.array(CliCommandOptionSchema),
});
export type CliCommandGroup = z.infer<typeof CliCommandGroupSchema>;

export const CliCommandCatalogSchema = z.object({
  groups: z.array(CliCommandGroupSchema),
});
export type CliCommandCatalog = z.infer<typeof CliCommandCatalogSchema>;
```

- [ ] **Step 2: Add the two `ConnectorsAPI` methods**

In `front/types/connectors/connectors_api.ts`, add the import near the other type imports:

```ts
import type { CliCommandCatalog } from "@app/types/connectors/admin/catalog";
```

Add both methods next to the existing `admin(...)` method (after line ~560). `adminRun` takes a permissive input type (not `AdminCommandType`) so the plugin can forward dynamically-built commands without an unsafe `as` — connectors re-validates against `AdminCommandSchema`.

```ts
  async getAdminCliCatalog(): Promise<
    ConnectorsAPIResponse<CliCommandCatalog>
  > {
    const res = await this._fetchWithError(
      `${this._url}/connectors/admin/catalog`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async adminRun(command: {
    majorCommand: string;
    command: string;
    args: Record<string, unknown>;
  }): Promise<ConnectorsAPIResponse<AdminResponseType>> {
    const res = await this._fetchWithError(
      `${this._url}/connectors/admin/run`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify(command),
      }
    );

    return this._resultFromResponse(res);
  }
```

- [ ] **Step 3: Typecheck**

Run: `cd front && npm run tsgo -- --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add front/types/connectors/admin/catalog.ts front/types/connectors/connectors_api.ts
git commit -m "feat(front): add ConnectorsAPI catalog + raw admin run methods"
```

---

## Task 5: Front — catalog proxy route + SWR hook

**Files:**
- Create: `front/types/api/poke/connectors/cli_catalog.ts`
- Create: `front-api/routes/poke/connectors/cli-catalog.ts`
- Modify: `front-api/routes/poke/connectors/index.ts`
- Modify: `front/poke/swr/plugins.ts`

**Interfaces:**
- Consumes: `ConnectorsAPI.getAdminCliCatalog()` (Task 4).
- Produces:
  - `PokeGetConnectorCliCatalogResponseBody = { catalog: CliCommandCatalog }`.
  - `GET /api/poke/connectors/cli-catalog`.
  - `usePokeConnectorCliCatalog({ disabled }): { catalog: CliCommandCatalog | null; isLoading; isError }`.

- [ ] **Step 1: Define the response body type**

Create `front/types/api/poke/connectors/cli_catalog.ts`:

```ts
import type { CliCommandCatalog } from "@app/types/connectors/admin/catalog";

export interface PokeGetConnectorCliCatalogResponseBody {
  catalog: CliCommandCatalog;
}
```

- [ ] **Step 2: Add the proxy route**

Create `front-api/routes/poke/connectors/cli-catalog.ts` (mirrors `front-api/routes/poke/admin.ts`; poke auth is applied by the parent poke sub-app):

```ts
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { PokeGetConnectorCliCatalogResponseBody } from "@app/types/api/poke/connectors/cli_catalog";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/poke/connectors/cli-catalog.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<PokeGetConnectorCliCatalogResponseBody> => {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const result = await connectorsAPI.getAdminCliCatalog();
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          connectors_error: result.error,
          message: "Error fetching the connectors CLI catalog.",
        },
      });
    }

    return ctx.json({ catalog: result.value });
  }
);

export default app;
```

- [ ] **Step 3: Mount the route**

In `front-api/routes/poke/connectors/index.ts`, add the import and the route:

```ts
import { pokeApp } from "@front-api/middlewares/ctx";

import connectorId from "./[connectorId]";
import cliCatalog from "./cli-catalog";

// Mounted at /api/poke/connectors.
const app = pokeApp();

app.route("/cli-catalog", cliCatalog);
app.route("/:connectorId", connectorId);

export default app;
```

- [ ] **Step 4: Add the SWR hook**

In `front/poke/swr/plugins.ts`, add the import at the top:

```ts
import type { PokeGetConnectorCliCatalogResponseBody } from "@app/types/api/poke/connectors/cli_catalog";
```

Add the hook (follows the `usePokePluginManifest` pattern; `disabled` per [REACT2]):

```ts
export function usePokeConnectorCliCatalog({
  disabled,
}: {
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const catalogFetcher: Fetcher<PokeGetConnectorCliCatalogResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/poke/connectors/cli-catalog`,
    catalogFetcher,
    { disabled }
  );

  return {
    catalog: data ? data.catalog : null,
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}
```

- [ ] **Step 5: Typecheck**

Run: `cd front && npm run tsgo -- --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add front/types/api/poke/connectors/cli_catalog.ts \
  front-api/routes/poke/connectors/cli-catalog.ts \
  front-api/routes/poke/connectors/index.ts front/poke/swr/plugins.ts
git commit -m "feat(front): add poke connectors CLI catalog route and SWR hook"
```

---

## Task 6: Front — args builder helper + the plugin

**Files:**
- Create: `front/lib/api/poke/plugins/global/args_json.ts`
- Create: `front/lib/api/poke/plugins/global/args_json.test.ts`
- Create: `front/lib/api/poke/plugins/global/run_connector_cli_command.ts`
- Modify: `front/lib/api/poke/plugins/global/index.ts`

**Interfaces:**
- Consumes: `ConnectorsAPI.adminRun()` (Task 4); `CliCommandOption` (Task 4).
- Produces:
  - `buildAdminRunArgs(rawValues: Record<string, string>, options: CliCommandOption[]): Record<string, unknown>` — drops empty values, coerces `isNumber` params to numbers. Used by the form (Task 7) AND re-derivable for tests. The form serializes its result with `JSON.stringify`; `execute` only `JSON.parse`s.
  - The plugin `runConnectorCliCommandPlugin` (id `run-connector-cli-command`).

- [ ] **Step 1: Write the failing test for `buildAdminRunArgs`**

Create `front/lib/api/poke/plugins/global/args_json.test.ts`:

```ts
import { buildAdminRunArgs } from "@app/lib/api/poke/plugins/global/args_json";
import type { CliCommandOption } from "@app/types/connectors/admin/catalog";
import { describe, expect, it } from "vitest";

const options: CliCommandOption[] = [
  { name: "connectorId", description: "", isNumber: true },
  { name: "channelId", description: "", isNumber: false },
  { name: "force", description: "", isNumber: false },
];

describe("buildAdminRunArgs", () => {
  it("coerces number params and keeps strings", () => {
    const args = buildAdminRunArgs(
      { connectorId: "42", channelId: "C123", force: "true" },
      options
    );
    expect(args).toEqual({ connectorId: 42, channelId: "C123", force: "true" });
  });

  it("drops empty values", () => {
    const args = buildAdminRunArgs(
      { connectorId: "", channelId: "C123" },
      options
    );
    expect(args).toEqual({ channelId: "C123" });
  });

  it("ignores values with no matching option", () => {
    const args = buildAdminRunArgs({ unknown: "x", channelId: "y" }, options);
    expect(args).toEqual({ channelId: "y" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd front && npx vitest run lib/api/poke/plugins/global/args_json.test.ts`
Expected: FAIL — `buildAdminRunArgs` is not defined.

- [ ] **Step 3: Implement `buildAdminRunArgs`**

Create `front/lib/api/poke/plugins/global/args_json.ts`:

```ts
import type { CliCommandOption } from "@app/types/connectors/admin/catalog";

// Builds the connectors admin `args` object from raw string form values:
// drops empty entries, coerces numeric params (per the catalog) to numbers,
// and ignores values that do not correspond to a known option.
export function buildAdminRunArgs(
  rawValues: Record<string, string>,
  options: CliCommandOption[]
): Record<string, unknown> {
  const optionByName = new Map(options.map((o) => [o.name, o]));
  const args: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(rawValues)) {
    const option = optionByName.get(name);
    if (!option || value === "") {
      continue;
    }
    args[name] = option.isNumber ? Number(value) : value;
  }

  return args;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd front && npx vitest run lib/api/poke/plugins/global/args_json.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the plugin**

Create `front/lib/api/poke/plugins/global/run_connector_cli_command.ts`. The manifest's three string fields exist only to satisfy the run endpoint's body validation (`createZodSchemaFromArgs`); the dedicated form (Task 7) produces them. `execute` parses `argsJson` (already-typed values) and forwards via `adminRun`.

```ts
import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const runConnectorCliCommandPlugin = createPlugin({
  manifest: {
    id: "run-connector-cli-command",
    name: "Run Connector CLI Command",
    description:
      "Run any connectors admin CLI command. Select a group and subcommand, " +
      "then fill in the parameters.",
    warning:
      "This runs raw connectors admin commands, including destructive ones. " +
      "Double-check the group, subcommand and parameters before running.",
    resourceTypes: ["global"],
    args: {
      majorCommand: { type: "string", label: "Command group" },
      command: { type: "string", label: "Subcommand" },
      argsJson: { type: "text", label: "Arguments (JSON)" },
    },
    requiredRoles: ["engineering"],
  },
  execute: async (_auth, _resource, args) => {
    const { majorCommand, command, argsJson } = args;

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = argsJson ? JSON.parse(argsJson) : {};
    } catch (err) {
      return new Err(
        new Error(`Invalid arguments JSON: ${normalizeError(err).message}`)
      );
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const result = await connectorsAPI.adminRun({
      majorCommand,
      command,
      args: parsedArgs,
    });

    if (result.isErr()) {
      return new Err(
        new Error(
          `Connectors error: ${result.error.message ?? "unknown error"}`
        )
      );
    }

    return new Ok({ display: "json", value: result.value });
  },
});
```

- [ ] **Step 6: Register the plugin**

In `front/lib/api/poke/plugins/global/index.ts`, add (keeping alphabetical/existing order):

```ts
export * from "./run_connector_cli_command";
```

- [ ] **Step 7: Typecheck**

Run: `cd front && npm run tsgo -- --noEmit`
Expected: no type errors. (`display: "json"` requires `value` to be `Record<string, unknown>`; `AdminResponseType` union members are objects/arrays. If the union includes an array response, wrap as `{ result: result.value }` in the `Ok` to satisfy the `PluginJSONResponse` type.)

- [ ] **Step 8: Commit**

```bash
git add front/lib/api/poke/plugins/global/args_json.ts \
  front/lib/api/poke/plugins/global/args_json.test.ts \
  front/lib/api/poke/plugins/global/run_connector_cli_command.ts \
  front/lib/api/poke/plugins/global/index.ts
git commit -m "feat(front): add run-connector-cli-command poke plugin"
```

---

## Task 7: Front — the dedicated dynamic form component

**Files:**
- Create: `front/components/poke/plugins/ConnectorCliCommandForm.tsx`

**Interfaces:**
- Consumes: `usePokeConnectorCliCatalog()` (Task 5); `buildAdminRunArgs()` (Task 6); `EnumSelect` (`@app/components/poke/plugins/EnumSelect`); `PokeFormInput` etc.
- Produces: `ConnectorCliCommandForm` component. On submit it calls `onSubmit({ majorCommand, command, argsJson })` — the same 3-field shape the plugin manifest declares (Task 6).

- [ ] **Step 1: Create the form component**

Create `front/components/poke/plugins/ConnectorCliCommandForm.tsx`. Props typed via `interface` ([REACT1]); loading state shown ([REACT3]).

```tsx
import { EnumSelect } from "@app/components/poke/plugins/EnumSelect";
import {
  PokeFormDescription,
  PokeFormInput,
  PokeFormItem,
  PokeFormLabel,
} from "@app/components/poke/shadcn/ui/form";
import { usePokeConnectorCliCatalog } from "@app/poke/swr/plugins";
import { buildAdminRunArgs } from "@app/lib/api/poke/plugins/global/args_json";
import type {
  CliCommandGroup,
  EnumValue,
} from "@app/types/connectors/admin/catalog";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface ConnectorCliCommandFormProps {
  disabled?: boolean;
  onSubmit: (args: {
    majorCommand: string;
    command: string;
    argsJson: string;
  }) => Promise<void>;
}

export function ConnectorCliCommandForm({
  disabled,
  onSubmit,
}: ConnectorCliCommandFormProps) {
  const { catalog, isLoading } = usePokeConnectorCliCatalog({
    disabled: false,
  });

  const [group, setGroup] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const selectedGroup: CliCommandGroup | null = useMemo(
    () => catalog?.groups.find((g) => g.majorCommand === group) ?? null,
    [catalog, group]
  );

  const groupOptions: EnumValue[] = useMemo(
    () =>
      (catalog?.groups ?? []).map((g) => ({
        label: g.majorCommand,
        value: g.majorCommand,
      })),
    [catalog]
  );

  const commandOptions: EnumValue[] = useMemo(
    () =>
      (selectedGroup?.subcommands ?? []).map((c) => ({ label: c, value: c })),
    [selectedGroup]
  );

  if (isLoading) {
    return <Spinner />;
  }

  if (!catalog) {
    return <div className="text-warning">Could not load the CLI catalog.</div>;
  }

  const canRun = group !== null && command !== null && !isSubmitted;

  const handleRun = async () => {
    if (group === null || command === null || selectedGroup === null) {
      return;
    }
    setIsSubmitted(true);
    const args = buildAdminRunArgs(paramValues, selectedGroup.options);
    await onSubmit({
      majorCommand: group,
      command,
      argsJson: JSON.stringify(args),
    });
  };

  return (
    <div className="flex max-w-[600px] flex-col gap-y-6">
      <PokeFormItem>
        <PokeFormLabel>Command group</PokeFormLabel>
        <EnumSelect
          label="Command group"
          options={groupOptions}
          values={group ? [group] : []}
          multiple={false}
          onValuesChange={(values) => {
            setGroup(values[0] ?? null);
            setCommand(null);
            setParamValues({});
          }}
        />
      </PokeFormItem>

      {selectedGroup && (
        <PokeFormItem>
          <PokeFormLabel>Subcommand</PokeFormLabel>
          <PokeFormDescription>
            {selectedGroup.description}
          </PokeFormDescription>
          <EnumSelect
            label="Subcommand"
            options={commandOptions}
            values={command ? [command] : []}
            multiple={false}
            onValuesChange={(values) => setCommand(values[0] ?? null)}
          />
        </PokeFormItem>
      )}

      {selectedGroup &&
        command &&
        selectedGroup.options.map((option) => (
          <PokeFormItem key={option.name}>
            <PokeFormLabel>{option.name}</PokeFormLabel>
            <PokeFormInput
              type={option.isNumber ? "number" : "text"}
              value={paramValues[option.name] ?? ""}
              onChange={(e) =>
                setParamValues((prev) => ({
                  ...prev,
                  [option.name]: e.target.value,
                }))
              }
            />
            {option.description && (
              <PokeFormDescription>{option.description}</PokeFormDescription>
            )}
          </PokeFormItem>
        ))}

      <Button
        variant="outline"
        label="Run"
        disabled={disabled || !canRun}
        onClick={handleRun}
      />
    </div>
  );
}
```

Note: `EnumValue` is imported from the catalog types file only if you re-export it there; otherwise import `EnumValue` from `@app/types/poke/plugins` (its canonical location). Prefer the canonical import:

```ts
import type { EnumValue } from "@app/types/poke/plugins";
import type { CliCommandGroup } from "@app/types/connectors/admin/catalog";
```

- [ ] **Step 2: Typecheck**

Run: `cd front && npm run tsgo -- --noEmit`
Expected: no type errors. (Confirm `PokeFormInput` accepts `value`/`onChange`/`type`; it wraps a standard input. If `PokeFormItem` requires form context, replace the outer wrappers with plain `div`s + `PokeFormLabel`/`PokeFormDescription` and keep `PokeFormInput`.)

- [ ] **Step 3: Commit**

```bash
git add front/components/poke/plugins/ConnectorCliCommandForm.tsx
git commit -m "feat(front): add dedicated connector CLI command form"
```

---

## Task 8: Front — wire the dialog to the dedicated form

**Files:**
- Modify: `front/components/poke/plugins/RunPluginDialog.tsx`

**Interfaces:**
- Consumes: `ConnectorCliCommandForm` (Task 7); existing `onSubmit`/`doRunPlugin`.

- [ ] **Step 1: Branch to the dedicated form by plugin id**

In `front/components/poke/plugins/RunPluginDialog.tsx`:

Add the import:

```ts
import { ConnectorCliCommandForm } from "@app/components/poke/plugins/ConnectorCliCommandForm";
```

Add a named constant near the top of the file (module scope):

```ts
const CONNECTOR_CLI_PLUGIN_ID = "run-connector-cli-command";
```

Replace the `<PluginForm ... />` usage (lines ~213-219) with a conditional. `ConnectorCliCommandForm` posts the same `{ majorCommand, command, argsJson }` shape that `onSubmit` → `doRunPlugin` already accepts:

```tsx
{plugin.id === CONNECTOR_CLI_PLUGIN_ID ? (
  <ConnectorCliCommandForm
    disabled={result !== null}
    onSubmit={onSubmit}
  />
) : (
  <PluginForm
    disabled={result !== null}
    manifest={manifest}
    asyncArgs={asyncArgs}
    onSubmit={onSubmit}
    pluginResourceTarget={pluginResourceTarget}
  />
)}
```

- [ ] **Step 2: Typecheck + format**

Run: `cd front && npm run tsgo -- --noEmit`
Expected: no type errors.
Run (repo root): `npm run format:changed`
Expected: formatting/lint clean.

- [ ] **Step 3: Manual end-to-end verification in Poke**

Start front + connectors locally. In Poke, open the global plugins list → "Run Connector CLI Command":
1. The group dropdown lists all groups (slack, notion, connectors, batch, temporal, ...).
2. Pick `slack` → subcommand dropdown shows slack subcommands; pick `check-channel`.
3. Param inputs appear (wId, channelId, ...). Fill `wId` and `channelId` for a real Slack data source.
4. Click Run → the JSON result renders in the dialog.
5. Confirm a `PluginRun` row was recorded (Poke plugin runs list).
6. Verify the role gate: only users with the `engineering` poke role see/run the plugin.

Expected: the command runs against connectors and returns its JSON result.

- [ ] **Step 4: Commit**

```bash
git add front/components/poke/plugins/RunPluginDialog.tsx
git commit -m "feat(front): use dedicated form for run-connector-cli-command plugin"
```

---

## Self-Review Notes

- **Spec coverage:** catalog endpoint (Task 3) ← Architecture §2; program builder (Task 1) ← Constraint 3; catalog proxy + hook (Task 5) ← §3; plugin (Task 6) ← §4; dedicated form (Task 7) ← §5; dialog wiring (Task 8) ← §5; Option A non-whitelisted run (Task 3) ← Security decision; `engineering` role (Task 6) ← Resolved decisions; per-group params + server-side required validation (Tasks 6–7) ← Non-goals.
- **`isNumber` derivation (spec open question):** resolved in Task 2 via `opt.parseArg === parseInt`; numeric params the CLI didn't declare with `parseInt` fall through as strings, which the connectors record-arg schemas accept.
- **Type consistency:** `CliCommandCatalog`/`CliCommandGroup`/`CliCommandOption` names and `{ groups: [...] }` / `{ catalog: ... }` shapes are consistent across connectors and front. `buildAdminRunArgs`, `buildCliCommandCatalog`, `getAdminCliCatalog`, `adminRun`, `usePokeConnectorCliCatalog`, and the `run-connector-cli-command` id are referenced identically wherever they appear.
- **Verify at review:** `member.shape.command.options` union access (Task 2 Step 5 has the fallback); `PokeFormInput`/`PokeFormItem` prop compatibility outside a react-hook-form context (Task 7 Step 2 note); `display: "json"` value typing (Task 6 Step 7 note).
