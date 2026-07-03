# Connector CLI Poke Plugin — Design

Date: 2026-07-03
Author: David Ebbo (with Claude)

## Overview

Add a single Poke plugin, **"Run Connector CLI Command"**, that automatically exposes every
connectors admin CLI command through a simple UI: pick a command group, pick a subcommand, fill in
the parameters, run. The command catalog (groups, subcommands, params) is discovered **live** from
the connectors service, so new CLI commands appear in Poke with zero front-end changes.

The connectors CLI is already zod-driven and discoverable; the richest machine-readable description
of commands and their flags lives in the Commander definition (`connectors/src/admin/cli.ts`). This
plugin surfaces that catalog to Poke and forwards the chosen command to the connectors admin API.

## Goals

- One Poke plugin that lists **all** CLI command groups and subcommands.
- Individual, typed input fields per parameter (not a raw JSON blob).
- Live discovery: the catalog is fetched from connectors at form-render time.
- Reuse existing Poke and connectors patterns; keep the generic plugin framework untouched.

## Non-goals

- Per-subcommand parameter precision. The CLI does not encode which params each subcommand
  requires (handlers validate at runtime, and several groups use an untyped `z.record` for args).
  Params are therefore known and shown **per group**, as optional; the connectors handlers remain
  the source of truth for required-arg validation.
- Rendering command response payloads in bespoke ways. Results are shown as JSON (the plugin's
  `execute` returns a `json` display).

## Constraints discovered

1. **Poke plugin field sets are static.** `PluginForm` renders one field per `manifest.args` entry.
   Async args (`populateAsyncArgs`) can supply enum *option lists* and default *values* once before
   render, and `dependsOn` toggles field *visibility* reactively — but neither can change the *set*
   of fields or make one dropdown's options react to another dropdown. A live catalog therefore
   cannot drive live per-command param fields through the vanilla form. → We render a dedicated form
   component for this one plugin (decided with the user).

2. **The run endpoint validates the posted body against the plugin's static manifest.**
   `front-api/routes/poke/plugins/[pluginId]/run.ts` builds a zod schema from
   `plugin.manifest.args` (`createZodSchemaFromArgs`) and validates the body before calling
   `execute`. So the dedicated form must post a body matching a static manifest. We keep the
   manifest to three string fields (`majorCommand`, `command`, `argsJson`) and serialize the
   collected params into `argsJson`; `execute` parses and coerces them.

3. **`connectors/src/admin/cli.ts` runs `program.parseAsync()` at import time.** The catalog
   endpoint cannot import it without executing the CLI. The Commander program construction must be
   extracted into a side-effect-free builder.

4. **The `/connectors/admin` HTTP endpoint enforces a hardcoded command whitelist** (~24 commands,
   `connectors/src/api/admin.ts`). "Expose all commands" collides with this. See
   [Security decision](#security-decision-command-whitelist).

## Architecture

Three layers, following existing patterns:

```
Poke UI (front)                     front server                connectors service
──────────────                      ────────────                ───────────────────
ConnectorCliCommandForm  ──GET──►   /api/poke/connectors/    ──►  GET /connectors/admin/catalog
  (group→command→params)              cli-catalog                  (introspect Commander program)
        │
        └──POST {majorCommand,   ──►  plugins/:id/run  ──►  plugin.execute ──►  POST /connectors/admin
             command, argsJson}                              (build command,    (run the command)
                                                             call connectors)
```

### 1. Connectors: side-effect-free program builder

- Extract the Commander program construction from `connectors/src/admin/cli.ts` into a new
  `connectors/src/admin/cli_program.ts` exporting `buildAdminProgram(): Command`.
- `cli.ts` imports `buildAdminProgram()` and keeps the `program.parseAsync(process.argv)` call
  (guarded so it only runs when executed as the CLI entry point).
- This makes the Commander definition — the source of subcommand lists, flag names, descriptions,
  and number hints — importable without side effects.

### 2. Connectors: catalog endpoint

- New `GET /connectors/admin/catalog` (in `connectors/src/api/admin.ts`, registered in
  `connectors/src/api_server.ts`). Read-only.
- Handler introspects `buildAdminProgram()` and returns a catalog:

  ```ts
  type CliCommandCatalog = {
    groups: Array<{
      majorCommand: string;         // e.g. "slack"
      description: string;          // Commander group description
      subcommands: string[];        // from the subcommand Argument's choices
      options: Array<{
        name: string;               // flag long name without "--", e.g. "connectorId"
        description: string;        // Commander option description
        isNumber: boolean;          // derived (see Open questions)
      }>;
    }>;
  };
  ```

- The catalog schema is defined with **zod** (per GEN13) and shared/typed so both the connectors
  response and the front consumer use the same type.

### 3. Front: catalog proxy + SWR hook

- New front API route `GET /api/poke/connectors/cli-catalog` (Poke-auth gated) that calls a new
  `ConnectorsAPI.getConnectorAdminCatalog()` method and returns the catalog. `execute` runs
  server-side, but the **form** runs client-side and needs the catalog to render, so it goes
  through a front route.
- New `ConnectorsAPI.getConnectorAdminCatalog()` in `front/types/connectors/connectors_api.ts`
  (GET `${url}/connectors/admin/catalog`).
- New SWR hook `usePokeConnectorCliCatalog()` in `front/poke/swr/` (per REACT2), with a `disabled`
  flag so it only fetches when the dialog is open.

### 4. Front: the plugin

- New plugin file `front/lib/api/poke/plugins/global/run_connector_cli_command.ts`, registered via
  the folder's `index.ts` (auto-discovered by `pluginManager`).
- Manifest:
  - `id: "run-connector-cli-command"`, `resourceTypes: ["global"]` (covers connector *and*
    non-connector groups like `batch`/`temporal`).
  - `requiredRoles`: the most privileged role — recommend `["engineering"]` (confirm at review;
    available roles: `admin`, `billing`, `engineering`, `support`, `talent`).
  - `warning`: a note that this runs raw admin commands.
  - `args`: three static string fields — `majorCommand` (`string`), `command` (`string`),
    `argsJson` (`text`). These exist only to satisfy the run endpoint's body validation; the
    dedicated form produces them.
- `execute(auth, _resource, { majorCommand, command, argsJson })`:
  - Parse `argsJson` (JSON object of param → value).
  - Coerce params flagged `isNumber` in the catalog to numbers.
  - Build the command object and forward to connectors (see below).
  - Return `new Ok({ display: "json", value: result })`, or `new Err(...)` on failure.

### 5. Front: dedicated form component

- New `ConnectorCliCommandForm` in `front/components/poke/plugins/`.
- `RunPluginDialog` renders `ConnectorCliCommandForm` instead of the generic `PluginForm` when
  `plugin.id === "run-connector-cli-command"`; the generic `PluginForm` is otherwise unchanged.
- Behavior:
  1. Fetch the catalog via `usePokeConnectorCliCatalog()` (with a loading spinner — REACT3).
  2. Group `<select>` (options = catalog groups).
  3. Command `<select>` (options = selected group's subcommands).
  4. One input per param in the selected group's `options` (number input when `isNumber`, text
     otherwise), each labeled with the param name + description.
  5. On submit, assemble `{ majorCommand, command, argsJson: JSON.stringify(nonEmptyParams) }`
     and call the dialog's `onSubmit` (unchanged run path → `doRunPlugin`).
- Reuse existing Poke form primitives (`PokeFormInput`, `EnumSelect`, etc.) for visual
  consistency (GEN1).

## Forwarding the command to connectors

`execute` must POST an arbitrary `{ majorCommand, command, args }` to connectors. To avoid an
unsafe `as` cast to the `AdminCommandType` discriminated union (GEN4), add a permissive
`ConnectorsAPI.adminRaw({ majorCommand: string; command: string; args: Record<string, unknown> })`
that posts to the connectors admin run path. The connectors side zod-validates against
`AdminCommandSchema`, which stays the authoritative validation; invalid commands return an error
that `execute` surfaces.

## Security decision: command whitelist

The existing `/connectors/admin` endpoint only runs commands present in the hardcoded
`whitelistedCommands` list. Exposing *all* commands via Poke requires a decision:

- **Option A (recommended): dedicated Poke-scoped run path that bypasses the interactive
  whitelist.** Add a run path in the connectors admin API used by this plugin that validates the
  command against `AdminCommandSchema` (authoritative) but is *not* limited to the whitelist. The
  existing whitelisted endpoint stays unchanged for other callers. Effective access is still gated:
  front reaches connectors with the shared API secret, and the plugin is Poke superuser +
  `requiredRoles` gated, with every run recorded as a `PluginRunResource` (audit trail). This
  matches Poke's existing threat model (Poke already exposes highly destructive operations).
- **Option B: expand the whitelist to all commands.** Simpler, but weakens the boundary for *every*
  caller of `/connectors/admin`, not just Poke.
- **Option C: keep the whitelist; the plugin exposes only whitelisted commands.** Safest, but the
  plugin no longer exposes "all" commands — contradicts the goal.

**This is the single decision requiring explicit sign-off** (security-sensitive; a follow-up
security review is warranted). The design assumes Option A unless changed at review.

## Data flow (happy path)

1. Support/eng user opens the "Run Connector CLI Command" plugin from the Poke global plugins list.
2. `RunPluginDialog` mounts `ConnectorCliCommandForm`, which fetches the live catalog.
3. User selects group `slack`, subcommand `check-channel`, fills `wId` and `channelId`.
4. Form posts `{ majorCommand: "slack", command: "check-channel", argsJson: '{"wId":"...","channelId":"..."}' }`.
5. Run endpoint validates the 3 string fields, records a `PluginRunResource`, calls `execute`.
6. `execute` parses `argsJson`, coerces numbers, calls `connectorsAPI.adminRaw(...)`.
7. Connectors validates against `AdminCommandSchema`, runs the command, returns the result.
8. `execute` returns `Ok({ display: "json", value })`; the dialog shows the JSON result.

## Error handling

- Catalog fetch failure → form shows an error state (no crash).
- Invalid `argsJson` / command rejected by connectors zod → `execute` returns `Err`; the run
  endpoint maps it to a 400 and the dialog shows the message.
- Connectors command runtime failure → surfaced as the connectors error message via `Err`.
- Follows `Result<>` conventions (ERR1) and `normalizeError` for caught errors (ERR2).

## Testing

- Connectors: a functional test for `GET /connectors/admin/catalog` asserting a representative group
  (e.g. `slack`) appears with its subcommands and options.
- Front: a functional test for the plugin `execute` (per TEST1) that mocks `ConnectorsAPI.adminRaw`
  and asserts the built command shape and number coercion. Use factories where resources are needed
  (TEST2/TEST5).
- The dedicated form is exercised manually in Poke; no unit tests for the component (per repo
  testing guidance — functional/endpoint-level only).

## Resolved decisions

1. **Whitelist / security → Option A (approved).** A Poke-scoped run path validates against
   `AdminCommandSchema` (authoritative) but is not limited to the interactive whitelist. The
   existing whitelisted endpoint stays unchanged for other callers. Access stays gated by the
   connectors API secret + Poke superuser + `requiredRoles` + `PluginRun` audit trail.
2. **`requiredRoles` → `["engineering"]` (approved).**

## Open questions (to resolve in the plan)

1. **`isNumber` derivation** — the cleanest signal for which params are numbers. Candidates:
   Commander option `parseArg === parseInt` hints, and/or the typed zod groups (`z.number()`).
   Untyped `z.record` groups accept strings anyway. Fallback: send all as strings and rely on the
   connectors schema's coercion where it exists; only coerce where we can prove a number is
   required. To be pinned down when writing the plan.

## File change summary

Connectors:
- `connectors/src/admin/cli_program.ts` (new) — `buildAdminProgram()`.
- `connectors/src/admin/cli.ts` — use the builder; guard `parseAsync`.
- `connectors/src/api/admin.ts` — add catalog handler + (Option A) a Poke-scoped run path;
  zod catalog schema.
- `connectors/src/api_server.ts` — register the catalog route.
- connectors types — catalog zod schema/type export.

Front:
- `front/types/connectors/connectors_api.ts` — `getConnectorAdminCatalog()`, `adminRaw()`.
- `front/lib/api/poke/plugins/global/run_connector_cli_command.ts` (new) + `global/index.ts` export.
- `front/poke/swr/` — `usePokeConnectorCliCatalog()`.
- `front-api/routes/poke/connectors/cli-catalog.ts` (new) — catalog proxy route.
- `front/components/poke/plugins/ConnectorCliCommandForm.tsx` (new).
- `front/components/poke/plugins/RunPluginDialog.tsx` — branch to the dedicated form by plugin id.
- Shared catalog type (front side), defined with zod.
- Front functional test for `execute`; connectors functional test for the catalog endpoint.
