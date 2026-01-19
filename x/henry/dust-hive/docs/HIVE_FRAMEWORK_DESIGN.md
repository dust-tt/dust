# Hive Framework Design Document

**Package:** `@dust-tt/hive`
**Status:** Draft
**Date:** 2026-01-19
**Authors:** Dust Engineering

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Goals & Non-Goals](#goals--non-goals)
4. [Architecture Overview](#architecture-overview)
5. [Core Design Principles](#core-design-principles)
6. [Public API](#public-api)
7. [Configuration Schema](#configuration-schema)
8. [Plugin & Hook System](#plugin--hook-system)
9. [Subsystem Details](#subsystem-details)
10. [Migration Path](#migration-path)
11. [Example Configurations](#example-configurations)
12. [Open Questions](#open-questions)

---

## Executive Summary

`@dust-tt/hive` is a framework for building CLI tools that manage multiple isolated development environments for monorepos. It extracts the generic infrastructure from `dust-hive` into a reusable library that other teams can use to create their own "Hive" for their codebases.

The framework provides:
- **Environment isolation** via git worktrees with dedicated port ranges
- **Service orchestration** with daemon management and health checks
- **Docker infrastructure** with per-environment port and volume isolation
- **Terminal multiplexer UI** (zellij/tmux) for log viewing
- **Managed services** (Temporal, test databases) shared across environments
- **Extensibility** via configuration, hooks, and plugins

Teams import `@dust-tt/hive` and create their own branded CLI (e.g., `acme-hive`) by providing a configuration file that defines their services, environment variables, initialization steps, and optional custom commands.

---

## Problem Statement

Modern monorepos often require running multiple services simultaneously during development (frontends, APIs, workers, databases). Developers frequently need to:

1. Work on multiple features in parallel without port conflicts
2. Test changes in isolation before merging
3. Switch between branches without rebuilding everything
4. Share infrastructure (databases, caches) efficiently

`dust-hive` solved these problems for Dust's monorepo, but the solution is tightly coupled to Dust's specific services, directory layout, and conventions. Other teams at Dust (and potentially external teams) face similar challenges but cannot use `dust-hive` without forking and heavily modifying it.

---

## Goals & Non-Goals

### Goals

1. **Extract a reusable framework** from `dust-hive` that other teams can adopt
2. **Maintain full backward compatibility** with existing `dust-hive` users during transition
3. **Provide a clean, typed configuration API** using TypeScript
4. **Support diverse tech stacks** (Node, Rust, Go, Python, etc.)
5. **Enable customization** via hooks and plugins without forking
6. **Keep the core minimal** - project-specific logic belongs in configuration/modules

### Non-Goals

1. **Windows support** - focus on macOS/Linux for v1
2. **Kubernetes/cloud deployment** - this is a local development tool
3. **GUI** - CLI-first, multiplexer for visualization
4. **Package management** - we orchestrate services, not dependencies
5. **Replacing Docker Compose** - we complement it with environment isolation

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        @dust-tt/hive                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                      Public API                             │ │
│  │  createHiveCLI()  defineConfig()  types & utilities        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Core Subsystems                          │ │
│  │                                                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ │
│  │  │ Config   │ │ Ports    │ │ Environ- │ │ Docker   │      │ │
│  │  │ Loader   │ │ Allocator│ │ ment Mgr │ │ Manager  │      │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ │
│  │                                                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │ │
│  │  │ Process  │ │ Service  │ │ Init     │ │ Worktree │      │ │
│  │  │ Manager  │ │ Registry │ │ Runner   │ │ Manager  │      │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │ │
│  │                                                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐       │ │
│  │  │ Mux      │ │ Template │ │ Managed Services     │       │ │
│  │  │ Adapters │ │ Engine   │ │ (Temporal, TestDBs)  │       │ │
│  │  └──────────┘ └──────────┘ └──────────────────────┘       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Plugin Interface                         │ │
│  │  Hooks (lifecycle)    Dependency Strategies    Commands    │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ import & configure
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Project CLI (e.g., dust-hive)                 │
│                                                                  │
│  hive.config.ts     ← Services, init, env, docker config        │
│  src/commands/      ← Custom commands (sync, seed-config)       │
│  src/plugins/       ← Custom plugins (shallow node_modules)     │
│  src/index.ts       ← CLI entry: createHiveCLI(config)          │
│                                                                  │
│  Binary: dust-hive                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **CLI Invocation**: User runs `dust-hive warm myenv`
2. **Config Loading**: Framework loads `hive.config.ts`, validates schema
3. **Context Resolution**: Resolves environment (from arg, cwd, or prompt)
4. **Template Expansion**: Expands `{{ports.front}}`, `{{paths.worktree}}` in config
5. **Command Execution**: Runs the command with resolved context
6. **Hook Invocation**: Calls registered hooks (beforeWarm, afterWarm)
7. **Subsystem Delegation**: Command delegates to subsystems (Docker, ProcessManager, etc.)

---

## Core Design Principles

### 1. Configuration Over Code

Project-specific behavior should be expressed as configuration, not code changes to the framework. The framework should be data-driven.

```typescript
// Good: Behavior expressed in config
services: {
  front: {
    cwd: "front",
    start: { runner: { type: "node", command: "npm run dev" } },
    readiness: { type: "http", url: "http://localhost:{{ports.front}}/health" }
  }
}

// Avoid: Hardcoding project-specific logic in framework
if (service === "front") {
  await runNpmDev();
}
```

### 2. Explicit Over Implicit

Dependencies, ordering, and behavior should be explicit in configuration rather than inferred from conventions or array order.

```typescript
// Good: Explicit dependencies
services: {
  api: {
    dependsOn: ["docker:db", "sdk"],  // Clear what must be ready first
  }
}

// Avoid: Implicit ordering via array position
services: ["sdk", "api"]  // Why is sdk first? Must read code to understand
```

### 3. Fail Fast, Fail Clearly

Errors should be detected early (config validation, prerequisite checks) and reported with actionable messages.

```typescript
// Good: Validate config at load time
if (!config.services.front.readiness) {
  throw new ConfigError(
    `Service 'front' missing readiness check`,
    { hint: "Add a readiness config to enable health monitoring" }
  );
}

// Avoid: Silent failures or generic errors
// "Cannot read property 'url' of undefined"
```

### 4. Escape Hatches Exist

While configuration handles most cases, the framework provides hooks and plugins for scenarios that cannot be expressed as data.

```typescript
// Config handles 90% of cases
services: { api: { start: { runner: { type: "node", command: "npm start" } } } }

// Hooks handle edge cases
hooks: {
  afterSpawn: async (ctx) => {
    // Custom SDK linking logic that can't be expressed as config
    await setupShallowNodeModules(ctx.worktree, ctx.mainRepo);
  }
}
```

### 5. Sensible Defaults, Full Overridability

The framework provides defaults that work for common cases, but everything can be overridden.

```typescript
// Minimal config uses defaults
export default defineConfig({
  project: { name: "acme" },
  services: { api: { cwd: ".", start: { command: "npm start" } } }
});

// Full control when needed
export default defineConfig({
  project: {
    name: "acme",
    cliName: "acme-hive",           // Override CLI name
    sessionPrefix: "ah-",            // Custom session prefix
  },
  ports: {
    base: 20000,                     // Different port range
    increment: 500,                  // Smaller blocks
  }
});
```

### 6. Composition Over Inheritance

Features are composed via configuration and plugins, not class hierarchies.

```typescript
// Good: Compose features via config
export default defineConfig({
  ...baseConfig,
  managedServices: { services: [...] },
  plugins: [forwarderPlugin({ mappings: [...] })]
});

// Avoid: Deep inheritance chains
class MyHive extends DustHive extends BaseHive { ... }
```

---

## Public API

### Main Exports

```typescript
// @dust-tt/hive

// === Configuration ===
export function defineConfig(config: HiveConfig): HiveConfig;
export function definePlugin(plugin: HivePlugin): HivePlugin;

// === CLI Factory ===
export function createHiveCLI(config: HiveConfig): HiveCLI;

// === Types (fully exported for consumers) ===
export type {
  // Core config types
  HiveConfig,
  ProjectConfig,
  RepoConfig,
  PortsConfig,

  // Service types
  ServiceDefinition,
  ServiceRunner,
  ReadinessCheck,

  // Environment types
  EnvironmentConfig,
  EnvExport,

  // Docker types
  DockerConfig,
  DockerServiceOverride,

  // Init types
  InitConfig,
  InitTask,
  InitRunner,

  // Temporal types
  TemporalConfig,
  TemporalNamespace,

  // Plugin types
  HivePlugin,
  HiveHooks,
  DependencyStrategy,

  // Runtime types
  HiveContext,
  Environment,
  PortAllocation,
};

// === Utilities ===
export { logger } from "./lib/logger";
export { Result, ok, err } from "./lib/result";
```

### `createHiveCLI(config)`

Creates and returns a CLI instance configured with the provided config.

```typescript
// src/index.ts in your project
import { createHiveCLI, defineConfig } from "@dust-tt/hive";
import { config } from "./hive.config";

const cli = createHiveCLI(config);
cli.run(process.argv);
```

The returned CLI includes all core commands (spawn, warm, cool, start, stop, destroy, list, status, logs, open, etc.) plus any custom commands registered via config.

### `defineConfig(config)`

Type-safe configuration helper with validation and defaults.

```typescript
import { defineConfig } from "@dust-tt/hive";

export const config = defineConfig({
  project: {
    name: "dust",
    cliName: "dust-hive",
  },
  // ... rest of config
});
```

### `definePlugin(plugin)`

Creates a reusable plugin that can be shared across projects.

```typescript
import { definePlugin } from "@dust-tt/hive";

export const myPlugin = definePlugin({
  name: "my-plugin",
  hooks: {
    beforeWarm: async (ctx) => { /* ... */ },
  },
  commands: [
    { name: "my-command", handler: async (ctx) => { /* ... */ } }
  ],
});
```

---

## Configuration Schema

### Complete HiveConfig Interface

```typescript
interface HiveConfig {
  /** Project identity and naming */
  project: ProjectConfig;

  /** Git repository settings */
  repo: RepoConfig;

  /** Port allocation scheme */
  ports: PortsConfig;

  /** Service definitions */
  services: ServicesConfig;

  /** Environment variable generation */
  env: EnvironmentConfig;

  /** Docker infrastructure (optional) */
  docker?: DockerConfig;

  /** Initialization pipeline (optional) */
  init?: InitConfig;

  /** Managed services - global daemons shared across envs (optional) */
  managedServices?: ManagedServicesConfig;

  /** Sync/cache management (optional) */
  sync?: SyncConfig;

  /** Port forwarding (optional) */
  forwarding?: ForwardingConfig;

  /** Multiplexer settings (optional) */
  multiplexer?: MultiplexerConfig;

  /** Lifecycle hooks (optional) */
  hooks?: HiveHooks;

  /** Custom commands (optional) */
  commands?: CustomCommand[];

  /** Plugins (optional) */
  plugins?: HivePlugin[];
}
```

### ProjectConfig

Controls naming and branding across the tool.

```typescript
interface ProjectConfig {
  /** Project name (used in messages, docs) */
  name: string;

  /** CLI binary name. Default: `${name}-hive` */
  cliName?: string;

  /** Home directory name under ~/. Default: `.${name}-hive` */
  homeDirName?: string;

  /** Worktrees directory name under ~/. Default: `${name}-hive` */
  worktreesDirName?: string;

  /** Prefix for multiplexer sessions. Default: `${cliName}-` */
  sessionPrefix?: string;

  /** Prefix for Docker projects/volumes. Default: `${cliName}-` */
  dockerPrefix?: string;
}
```

### RepoConfig

Git worktree and repository settings.

```typescript
interface RepoConfig {
  /** Base branch for worktrees. Default: "main" */
  baseBranch?: string;

  /** Absolute path to worktrees directory. Default: `~/${project.worktreesDirName}` */
  worktreesDir?: string;

  /** Branch naming template. Default: `{{settings.branchPrefix}}{{env.name}}` */
  branchNameTemplate?: string;

  /** Dependency linking strategies */
  dependencies?: DependencyConfig;
}

interface DependencyConfig {
  /** Named dependency strategies */
  strategies: Record<string, DependencyStrategy>;

  /** Which strategies to apply during spawn */
  applyOnSpawn: string[];
}

type DependencyStrategy =
  | { type: "symlink"; from: string; to: string }
  | { type: "copy"; from: string; to: string; globs?: string[] }
  | { type: "shallowNodeModules"; from: string; to: string; overrides?: Record<string, string> }
  | { type: "custom"; handler: (ctx: SpawnContext) => Promise<void> };
```

### PortsConfig

Port allocation scheme.

```typescript
interface PortsConfig {
  /** Starting port for first environment. Default: 10000 */
  base?: number;

  /** Port range per environment. Default: 1000 */
  increment?: number;

  /** Named port offsets within each environment's range */
  offsets: Record<string, number>;
}

// Example: With base=10000, increment=1000, offsets={front:0, api:1, postgres:432}
// Env 1: front=10000, api=10001, postgres=10432
// Env 2: front=11000, api=11001, postgres=11432
```

### ServicesConfig

Service definitions and orchestration.

```typescript
interface ServicesConfig {
  /** Service start order (also used as default dependency order) */
  order: string[];

  /** Service definitions keyed by ID */
  definitions: Record<string, ServiceDefinition>;
}

interface ServiceDefinition {
  /** Working directory relative to worktree root */
  cwd: string;

  /** How to start the service */
  start: {
    /** Command runner configuration */
    runner: ServiceRunner;

    /** Pre-start bootstrap steps */
    bootstrap?: {
      /** Source the generated env.sh before starting */
      sourceEnvFile?: boolean;
      /** Source nvm before starting (for Node services) */
      sourceNvm?: boolean;
      /** Additional environment variables */
      env?: Record<string, TemplateString>;
    };
  };

  /** Health check configuration */
  readiness?: ReadinessCheck;

  /** Port mapping for display/status */
  ports?: {
    /** Primary port key from PortsConfig.offsets */
    primary?: string;
  };

  /** Explicit dependencies (service IDs or infra tokens like "docker:db") */
  dependsOn?: string[];

  /** When to start this service */
  startOn?: ("spawn" | "warm")[];

  /** Display name (defaults to ID) */
  displayName?: string;
}

type ServiceRunner =
  | { type: "shell"; command: TemplateString }
  | { type: "node"; command: TemplateString; useNvm?: boolean }
  | { type: "cargo"; command: TemplateString }
  | { type: "bun"; command: TemplateString }
  | { type: "go"; command: TemplateString }
  | { type: "python"; command: TemplateString };

type ReadinessCheck =
  | { type: "http"; url: TemplateString; timeoutMs?: number; intervalMs?: number }
  | { type: "tcp"; host?: TemplateString; port: TemplateString; timeoutMs?: number }
  | { type: "file"; path: TemplateString; timeoutMs?: number; errorPatterns?: string[] }
  | { type: "command"; command: TemplateString; timeoutMs?: number };
```

### EnvironmentConfig

Environment variable generation.

```typescript
interface EnvironmentConfig {
  /** Path to secrets file (sourced at top of env.sh) */
  secretsFile: string;

  /** Required secret keys (validated by doctor command) */
  requiredSecrets?: string[];

  /** Environment variable exports */
  exports: EnvExport[];

  /** Direnv integration */
  direnv?: {
    enabled: boolean;
    autoAllow?: boolean;
  };
}

interface EnvExport {
  /** Environment variable name */
  name: string;

  /** Value (supports template strings) */
  value: TemplateString;

  /** Optional comment in generated env.sh */
  comment?: string;
}

// Template strings support: {{env.name}}, {{ports.*}}, {{paths.*}},
// {{project.*}}, {{docker.*}}, {{mainRepo}}, {{worktree}}
type TemplateString = string;
```

### DockerConfig

Docker Compose integration.

```typescript
interface DockerConfig {
  /** Enable Docker support. Default: true */
  enabled?: boolean;

  /** Path to base docker-compose.yml */
  baseComposePath: string;

  /** Path template for generated override file */
  overridePathTemplate?: string;

  /** Docker Compose project name template */
  projectNameTemplate?: string;

  /** Per-service overrides (ports, volumes) */
  overrides: Record<string, DockerServiceOverride>;

  /** Volume name template */
  volumeNameTemplate?: string;
}

interface DockerServiceOverride {
  /** Port mappings */
  ports?: Array<{
    host: TemplateString;
    container: number;
  }>;

  /** Volume mappings */
  volumes?: Array<{
    name: TemplateString;
    mount: string;
  }>;
}
```

### InitConfig

Initialization pipeline.

```typescript
interface InitConfig {
  /** Enable initialization. Default: true */
  enabled?: boolean;

  /** Infrastructure to wait for before running tasks */
  waitFor?: Array<{
    id: string;
    type: "dockerHealth";
    dockerService: string;
    timeoutMs?: number;
  }>;

  /** Initialization tasks */
  tasks: InitTask[];

  /** Database seeding configuration */
  seed?: {
    enabled: boolean;
    task: InitTask;
  };
}

interface InitTask {
  /** Unique task identifier */
  id: string;

  /** Human-readable description */
  description?: string;

  /** Dependencies (other task IDs or wait IDs) */
  dependsOn?: string[];

  /** When to run: "firstWarm" (default), "always", or "manual" */
  when?: "firstWarm" | "always" | "manual";

  /** Task runner */
  runner: InitRunner;

  /** Idempotency detection */
  idempotent?: {
    /** Treat as success if stdout/stderr contains these */
    successPatterns?: string[];
    /** Require stdout to contain these for success */
    requiredOutput?: string[];
  };

  /** Retry configuration */
  retry?: {
    maxAttempts: number;
    backoffMs?: number;
    retryOnPatterns?: string[];
  };
}

type InitRunner =
  | { type: "shell"; cwd: string; command: TemplateString; bootstrap?: { sourceEnvFile?: boolean; sourceNvm?: boolean } }
  | { type: "psql"; uri: TemplateString; sql: string }
  | { type: "psqlFile"; uri: TemplateString; path: TemplateString }
  | { type: "createDatabases"; uri: TemplateString; databases: string[] }
  | { type: "cargoBinary"; cwd: string; binary: string; args?: TemplateString[]; useCache?: boolean };
```

### ManagedServicesConfig

Managed services are **global daemons shared across all environments**. Unlike per-environment services (front, api, etc.), managed services run once and are used by all environments simultaneously.

Examples:
- **Temporal** - workflow engine with per-env namespaces
- **Kafka/Redpanda** - message broker with per-env topics
- **LocalStack** - AWS emulator
- **Shared test databases** - Postgres/Redis for running tests

```typescript
interface ManagedServicesConfig {
  /** List of managed service definitions */
  services: ManagedServiceDefinition[];
}

interface ManagedServiceDefinition {
  /** Unique service identifier */
  id: string;

  /** Human-readable name */
  displayName?: string;

  /** How to start the service daemon */
  start: {
    /** Command to run */
    command: TemplateString;
    /** Working directory */
    cwd?: TemplateString;
    /** Additional arguments */
    args?: TemplateString[];
  };

  /** Health check to determine if service is ready */
  readiness?: ReadinessCheck;

  /** Paths for daemon management */
  paths?: {
    pidFile?: TemplateString;
    logFile?: TemplateString;
    dataDir?: TemplateString;
  };

  /** Per-environment setup (run when environment is warmed) */
  perEnvSetup?: ManagedServiceEnvSetup[];

  /** Environment variables to export (global, not per-env) */
  globalEnvExports?: EnvExport[];

  /** CLI subcommand (e.g., "temporal" creates `hive temporal start/stop/logs`) */
  cliSubcommand?: string;
}

interface ManagedServiceEnvSetup {
  /** Setup task identifier */
  id: string;

  /** Description */
  description?: string;

  /** Command to run for each environment */
  command: TemplateString;

  /** Environment variables to export per environment */
  envExports?: EnvExport[];

  /** Only run on first warm */
  onlyFirstWarm?: boolean;
}
```

**Example: Temporal as a managed service**

```typescript
managedServices: {
  services: [
    {
      id: "temporal",
      displayName: "Temporal Server",
      start: {
        command: "temporal server start-dev --db-filename {{paths.home}}/temporal.db --port 7233",
      },
      readiness: { type: "tcp", port: "7233" },
      paths: {
        pidFile: "{{paths.home}}/temporal.pid",
        logFile: "{{paths.home}}/temporal.log",
        dataDir: "{{paths.home}}/temporal.db",
      },
      cliSubcommand: "temporal", // Creates: hive temporal start|stop|status|logs
      perEnvSetup: [
        {
          id: "create-namespaces",
          description: "Create Temporal namespaces",
          command: "temporal operator namespace create {{project.name}}-{{env.name}} --address localhost:7233",
          envExports: [
            { name: "TEMPORAL_NAMESPACE", value: "{{project.name}}-{{env.name}}" },
          ],
          onlyFirstWarm: true,
        },
        {
          id: "create-agent-namespace",
          description: "Create agent namespace",
          command: "temporal operator namespace create {{project.name}}-{{env.name}}-agent --address localhost:7233",
          envExports: [
            { name: "TEMPORAL_AGENT_NAMESPACE", value: "{{project.name}}-{{env.name}}-agent" },
          ],
          onlyFirstWarm: true,
        },
      ],
    },
  ],
}
```

**Example: Shared test Postgres as a managed service**

```typescript
managedServices: {
  services: [
    {
      id: "test-postgres",
      displayName: "Test Postgres",
      start: {
        command: "docker run --name {{project.name}}-test-postgres -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:14",
      },
      readiness: { type: "tcp", port: "5433" },
      cliSubcommand: "test-db",
      perEnvSetup: [
        {
          id: "create-test-db",
          description: "Create per-env test database",
          command: "createdb -h localhost -p 5433 -U test {{project.name}}_test_{{env.name}}",
          envExports: [
            { name: "TEST_DATABASE_URI", value: "postgres://test:test@localhost:5433/{{project.name}}_test_{{env.name}}" },
          ],
          onlyFirstWarm: true,
        },
      ],
    },
  ],
}
```

**Example: LocalStack for AWS emulation**

```typescript
managedServices: {
  services: [
    {
      id: "localstack",
      displayName: "LocalStack",
      start: {
        command: "docker run --name {{project.name}}-localstack -p 4566:4566 localstack/localstack",
      },
      readiness: { type: "http", url: "http://localhost:4566/_localstack/health" },
      globalEnvExports: [
        { name: "AWS_ENDPOINT_URL", value: "http://localhost:4566" },
        { name: "AWS_ACCESS_KEY_ID", value: "test" },
        { name: "AWS_SECRET_ACCESS_KEY", value: "test" },
      ],
    },
  ],
}
```

**Key differences from per-env services:**

| Aspect | Per-Env Services | Managed Services |
|--------|-----------------|------------------|
| Lifecycle | Start/stop with environment | Start with `up`, stop with `down` |
| Instances | One per environment | One shared globally |
| Ports | From environment's port range | Fixed global ports |
| State | Isolated per environment | Shared (may have per-env namespaces/DBs) |
| Commands | `hive warm/cool/stop` | `hive <service> start/stop` |

### SyncConfig

Main repository synchronization and cache management.

The `sync` command keeps the main repository up-to-date and rebuilds cached artifacts. This is essential for monorepos where worktrees depend on pre-built binaries, shared node_modules, or other cached assets from the main repo.

```typescript
interface SyncConfig {
  /** Enable sync command. Default: true */
  enabled: boolean;

  /** Git sync settings */
  git?: {
    /** Use git-spice for repo sync if available */
    useGitSpice?: boolean;
    /** Pull strategy: "rebase" (default) or "merge" */
    pullStrategy?: "rebase" | "merge";
  };

  /** Artifacts to track and rebuild */
  artifacts: SyncArtifact[];

  /** State file location for change detection */
  stateFile?: string;
}

interface SyncArtifact {
  /** Unique artifact identifier */
  id: string;

  /** Human-readable description */
  description?: string;

  /** Change detection strategy */
  detect: ArtifactDetection;

  /** Rebuild/update action when changes detected */
  update: ArtifactUpdate;
}

type ArtifactDetection =
  /** Hash a lock file to detect dependency changes */
  | { type: "lockfileHash"; path: TemplateString }
  /** Check if files changed between git commits */
  | { type: "gitDiff"; paths: TemplateString[] }
  /** Check if output files exist */
  | { type: "outputExists"; paths: TemplateString[] }
  /** Always rebuild */
  | { type: "always" };

type ArtifactUpdate =
  /** Run a shell command */
  | { type: "shell"; cwd: TemplateString; command: TemplateString }
  /** Run npm/pnpm/yarn install */
  | { type: "npmInstall"; cwd: TemplateString }
  /** Run bun install */
  | { type: "bunInstall"; cwd: TemplateString }
  /** Build cargo binaries */
  | { type: "cargoBuild"; cwd: TemplateString; binaries: string[] }
  /** Custom handler function */
  | { type: "custom"; handler: (ctx: SyncContext) => Promise<void> };
```

**Example: Dust's sync artifacts**

```typescript
sync: {
  enabled: true,
  git: { useGitSpice: true, pullStrategy: "rebase" },
  artifacts: [
    // Node dependencies (only if lock file changed)
    {
      id: "front-deps",
      description: "Front node_modules",
      detect: { type: "lockfileHash", path: "{{mainRepo}}/front/package-lock.json" },
      update: { type: "npmInstall", cwd: "{{mainRepo}}/front" },
    },
    {
      id: "connectors-deps",
      description: "Connectors node_modules",
      detect: { type: "lockfileHash", path: "{{mainRepo}}/connectors/package-lock.json" },
      update: { type: "npmInstall", cwd: "{{mainRepo}}/connectors" },
    },
    {
      id: "sdk-deps",
      description: "SDK node_modules",
      detect: { type: "lockfileHash", path: "{{mainRepo}}/sdks/js/package-lock.json" },
      update: { type: "npmInstall", cwd: "{{mainRepo}}/sdks/js" },
    },
    // Rust binaries (only if core/ changed)
    {
      id: "rust-binaries",
      description: "Core Rust binaries for init",
      detect: { type: "gitDiff", paths: ["core/"] },
      update: { type: "cargoBuild", cwd: "{{mainRepo}}/core", binaries: ["init_db", "qdrant_create_collection", "elasticsearch_create_index"] },
    },
    // dust-hive itself
    {
      id: "dust-hive",
      description: "dust-hive CLI",
      detect: { type: "lockfileHash", path: "{{mainRepo}}/x/henry/dust-hive/bun.lockb" },
      update: { type: "bunInstall", cwd: "{{mainRepo}}/x/henry/dust-hive" },
    },
  ],
}
```

**Why is sync important?**

In monorepos with worktrees:
- Worktrees symlink to main repo's `node_modules` and `target/` directories
- If main repo's dependencies are outdated, all worktrees break
- Binary caching (Rust) speeds up environment initialization
- `sync` is the single command to bring everything up-to-date

For simpler projects without caching needs, `sync` can be disabled entirely.

### HiveHooks

Lifecycle hooks for custom behavior.

```typescript
interface HiveHooks {
  /** Called before spawning a new environment */
  beforeSpawn?: (ctx: SpawnContext) => Promise<void>;

  /** Called after spawning (worktree created, SDK started) */
  afterSpawn?: (ctx: SpawnContext) => Promise<void>;

  /** Called before warming an environment */
  beforeWarm?: (ctx: WarmContext) => Promise<void>;

  /** Called after warming (all services started) */
  afterWarm?: (ctx: WarmContext) => Promise<void>;

  /** Called before initialization tasks run */
  beforeInit?: (ctx: InitContext) => Promise<void>;

  /** Called after initialization completes */
  afterInit?: (ctx: InitContext) => Promise<void>;

  /** Called before destroying an environment */
  beforeDestroy?: (ctx: DestroyContext) => Promise<void>;

  /** Called after environment is destroyed */
  afterDestroy?: (ctx: DestroyContext) => Promise<void>;
}
```

---

## Plugin & Hook System

### Plugin Interface

Plugins bundle related functionality (hooks, commands, config extensions).

```typescript
interface HivePlugin {
  /** Unique plugin name */
  name: string;

  /** Plugin version */
  version?: string;

  /** Lifecycle hooks */
  hooks?: Partial<HiveHooks>;

  /** Custom commands */
  commands?: CustomCommand[];

  /** Config preprocessor (modify config before validation) */
  preprocessConfig?: (config: HiveConfig) => HiveConfig;

  /** Subsystem extensions */
  extensions?: {
    /** Additional dependency strategies */
    dependencyStrategies?: Record<string, DependencyStrategyHandler>;
    /** Additional init runners */
    initRunners?: Record<string, InitRunnerHandler>;
    /** Additional service runners */
    serviceRunners?: Record<string, ServiceRunnerHandler>;
  };
}

interface CustomCommand {
  /** Command name (e.g., "sync") */
  name: string;

  /** Command description for help text */
  description: string;

  /** Argument signature (cac-style, e.g., "[name]") */
  args?: string;

  /** Command options */
  options?: Array<{
    flags: string;
    description: string;
    default?: unknown;
  }>;

  /** Command handler */
  handler: (ctx: CommandContext, ...args: unknown[]) => Promise<void>;
}
```

### Built-in Plugins

The framework ships with optional plugins for common use cases:

```typescript
import { forwarderPlugin } from "@dust-tt/hive/plugins";

export default defineConfig({
  // ...
  plugins: [
    // Port forwarder: map fixed ports to active environment
    // Useful for OAuth callbacks that require fixed redirect URIs
    forwarderPlugin({
      mappings: [
        { listenPort: 3000, targetPortKey: "front" },
        { listenPort: 3001, targetPortKey: "api" },
      ],
    }),
  ],
});
```

**Note**: Temporal, test databases, and other shared services are now configured via `managedServices` in the main config, not as plugins. This provides a unified way to define any global daemon.

---

## Subsystem Details

### Port Allocator

Manages port allocation with file-based locking for concurrent safety.

- Base port configurable (default: 10000)
- 1000-port blocks per environment (configurable)
- Named offsets for predictable port mapping
- Lock file prevents race conditions during allocation

### Process Manager

Manages service daemons via PID files.

- Services run as detached process groups
- Logs captured to per-service files with rotation
- Graceful shutdown via SIGTERM with fallback to SIGKILL
- Health checks determine "running" vs "healthy" status

### Docker Manager

Orchestrates Docker Compose with per-environment isolation.

- Base compose file (project-provided) + generated override
- Override sets host ports and volume names per environment
- Project naming ensures container isolation
- Health checks wait for container readiness

### Init Runner

Executes initialization tasks as a DAG.

- Tasks declare dependencies on other tasks or infrastructure
- Parallel execution where dependencies allow
- Idempotency detection via output pattern matching
- Retry with backoff for transient failures

### Template Engine

Simple, safe string interpolation.

- Syntax: `{{path.to.value}}`
- No logic (loops, conditionals) - just value substitution
- Predefined context: `env`, `ports`, `paths`, `project`, `docker`, `mainRepo`, `worktree`
- Validation at config load time

### Multiplexer Adapters

Abstraction over terminal multiplexers.

- Supported: zellij (default), tmux
- Sessions are view-only (logs + shell)
- Closing session does NOT stop services
- Layout generation from service registry

### Sync Manager

Keeps the main repository up-to-date and manages cached artifacts.

- Runs on main repo only (not worktrees)
- Detects changes via lock file hashing and git diff
- Selective rebuilds: only update what changed
- Persists state between runs to avoid unnecessary work
- Integrates with git-spice for advanced git workflows

**The sync flow:**

1. **Pull latest** - `git pull --rebase` (or git-spice repo sync)
2. **Detect changes** - Compare lock file hashes and git diffs against saved state
3. **Update artifacts** - Run npm install, cargo build, etc. only for changed artifacts
4. **Save state** - Record current hashes/commits for next run

**Why this matters for worktrees:**

Worktrees share cached assets with the main repo:
- `node_modules/` is symlinked from main repo
- `target/` (Rust) is symlinked from main repo
- Init binaries come from main repo's build cache

If the main repo is outdated, all worktrees break. `sync` is the single command to fix this.

---

## Migration Path

### Phase 1: Internal Refactor (No External Changes)

1. Introduce `ProjectConfig` internally
2. Replace hardcoded strings with config-derived values
3. Add config loader that reads from internal defaults
4. Verify all tests pass, behavior unchanged

### Phase 2: Config Extraction

5. Move service registry to config format
6. Move environment variable definitions to config
7. Move Docker/init/managed services settings to config
8. Dust config lives alongside framework code

### Phase 3: Package Split

9. Create `@dust-tt/hive` package structure
10. Export public API (types, createHiveCLI, defineConfig)
11. Dust CLI imports from `@dust-tt/hive`
12. Publish to npm (internal registry first)

### Phase 4: Documentation & Adoption

13. Write getting started guide
14. Create starter templates for common setups
15. Document migration for existing users
16. Support early adopter teams

### Backward Compatibility

During transition:
- Existing `~/.dust-hive` directories continue to work
- Old port allocations are honored
- No forced migration of volumes/sessions
- `dust-hive` binary works exactly as before

---

## Example Configurations

### Example 1: Dust (Current Behavior)

```typescript
// hive.config.ts
import { defineConfig } from "@dust-tt/hive";
import { dustSyncCommand, dustSeedConfigCommand } from "./commands";
import { shallowNodeModulesStrategy } from "./plugins";

export default defineConfig({
  project: {
    name: "dust",
    cliName: "dust-hive",
  },

  repo: {
    baseBranch: "main",
    dependencies: {
      strategies: {
        cargoTarget: { type: "symlink", from: "{{mainRepo}}/core/target", to: "{{worktree}}/core/target" },
        sdkNodeModules: { type: "symlink", from: "{{mainRepo}}/sdks/js/node_modules", to: "{{worktree}}/sdks/js/node_modules" },
        frontNodeModules: { type: "shallowNodeModules", from: "{{mainRepo}}/front/node_modules", to: "{{worktree}}/front/node_modules", overrides: { "@dust-tt/client": "{{worktree}}/sdks/js" } },
        connectorsNodeModules: { type: "shallowNodeModules", from: "{{mainRepo}}/connectors/node_modules", to: "{{worktree}}/connectors/node_modules", overrides: { "@dust-tt/client": "{{worktree}}/sdks/js" } },
      },
      applyOnSpawn: ["cargoTarget", "sdkNodeModules", "frontNodeModules", "connectorsNodeModules"],
    },
  },

  ports: {
    base: 10000,
    increment: 1000,
    offsets: {
      front: 0,
      core: 1,
      connectors: 2,
      oauth: 6,
      postgres: 432,
      redis: 379,
      qdrantHttp: 333,
      qdrantGrpc: 334,
      elasticsearch: 200,
      apacheTika: 998,
    },
  },

  services: {
    order: ["sdk", "front", "core", "oauth", "connectors", "front-workers"],
    definitions: {
      sdk: {
        cwd: "sdks/js",
        start: { runner: { type: "node", command: "npm run watch", useNvm: true } },
        readiness: { type: "file", path: "{{paths.worktree}}/sdks/js/dist/client.esm.js" },
        startOn: ["spawn"],
      },
      front: {
        cwd: "front",
        start: { runner: { type: "node", command: "npm run dev", useNvm: true }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.front}}/api/healthz" },
        ports: { primary: "front" },
        dependsOn: ["sdk"],
      },
      core: {
        cwd: "core",
        start: { runner: { type: "cargo", command: "cargo run --bin core-api" }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.core}}/" },
        ports: { primary: "core" },
      },
      oauth: {
        cwd: "core",
        start: { runner: { type: "cargo", command: "cargo run --bin oauth" }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.oauth}}/" },
        ports: { primary: "oauth" },
      },
      connectors: {
        cwd: "connectors",
        start: {
          runner: { type: "node", command: "npx tsx src/start.ts -p {{ports.connectors}}", useNvm: true },
          bootstrap: { sourceEnvFile: true },  // TEMPORAL_CONNECTORS_NAMESPACE comes from managed service perEnvSetup
        },
        ports: { primary: "connectors" },
      },
      "front-workers": {
        cwd: "front",
        start: { runner: { type: "shell", command: "./admin/dev_worker.sh" }, bootstrap: { sourceEnvFile: true, sourceNvm: true } },
      },
    },
  },

  env: {
    secretsFile: "~/.dust-hive/config.env",
    exports: [
      { name: "PORT", value: "{{ports.front}}" },
      { name: "CORE_PORT", value: "{{ports.core}}" },
      { name: "CONNECTORS_PORT", value: "{{ports.connectors}}" },
      { name: "OAUTH_PORT", value: "{{ports.oauth}}" },
      { name: "CORE_API", value: "http://localhost:{{ports.core}}" },
      { name: "CONNECTORS_API", value: "http://localhost:{{ports.connectors}}" },
      { name: "OAUTH_API", value: "http://localhost:{{ports.oauth}}" },
      { name: "DUST_FRONT_API", value: "http://localhost:{{ports.front}}" },
      { name: "DUST_CLIENT_FACING_URL", value: "http://localhost:{{ports.front}}" },
      { name: "FRONT_DATABASE_URI", value: "postgres://dev:dev@localhost:{{ports.postgres}}/dust_front" },
      { name: "CORE_DATABASE_URI", value: "postgres://dev:dev@localhost:{{ports.postgres}}/dust_api" },
      { name: "CONNECTORS_DATABASE_URI", value: "postgres://dev:dev@localhost:{{ports.postgres}}/dust_connectors" },
      { name: "OAUTH_DATABASE_URI", value: "postgres://dev:dev@localhost:{{ports.postgres}}/dust_oauth" },
      { name: "REDIS_URI", value: "redis://localhost:{{ports.redis}}" },
      { name: "QDRANT_CLUSTER_0_URL", value: "http://127.0.0.1:{{ports.qdrantGrpc}}" },
      { name: "ELASTICSEARCH_URL", value: "http://localhost:{{ports.elasticsearch}}" },
      { name: "TEXT_EXTRACTION_URL", value: "http://localhost:{{ports.apacheTika}}" },
      // ... more exports
    ],
    direnv: { enabled: true, autoAllow: true },
  },

  docker: {
    baseComposePath: "{{paths.hiveRoot}}/docker-compose.yml",
    overrides: {
      db: { ports: [{ host: "{{ports.postgres}}", container: 5432 }], volumes: [{ name: "{{project.dockerPrefix}}{{env.name}}-pgsql", mount: "/var/lib/postgresql/data" }] },
      redis: { ports: [{ host: "{{ports.redis}}", container: 6379 }] },
      qdrant: { ports: [{ host: "{{ports.qdrantHttp}}", container: 6333 }, { host: "{{ports.qdrantGrpc}}", container: 6334 }], volumes: [{ name: "{{project.dockerPrefix}}{{env.name}}-qdrant", mount: "/qdrant/storage" }] },
      elasticsearch: { ports: [{ host: "{{ports.elasticsearch}}", container: 9200 }], volumes: [{ name: "{{project.dockerPrefix}}{{env.name}}-elasticsearch", mount: "/usr/share/elasticsearch/data" }] },
      "apache-tika": { ports: [{ host: "{{ports.apacheTika}}", container: 9998 }] },
    },
  },

  managedServices: {
    services: [
      {
        id: "temporal",
        displayName: "Temporal Server",
        start: { command: "temporal server start-dev --db-filename {{paths.home}}/temporal.db --port 7233" },
        readiness: { type: "tcp", port: "7233" },
        paths: { pidFile: "{{paths.home}}/temporal.pid", logFile: "{{paths.home}}/temporal.log" },
        cliSubcommand: "temporal",
        perEnvSetup: [
          { id: "ns-default", command: "temporal operator namespace create {{project.name}}-{{env.name}}", envExports: [{ name: "TEMPORAL_NAMESPACE", value: "{{project.name}}-{{env.name}}" }], onlyFirstWarm: true },
          { id: "ns-agent", command: "temporal operator namespace create {{project.name}}-{{env.name}}-agent", envExports: [{ name: "TEMPORAL_AGENT_NAMESPACE", value: "{{project.name}}-{{env.name}}-agent" }], onlyFirstWarm: true },
          { id: "ns-connectors", command: "temporal operator namespace create {{project.name}}-{{env.name}}-connectors", envExports: [{ name: "TEMPORAL_CONNECTORS_NAMESPACE", value: "{{project.name}}-{{env.name}}-connectors" }], onlyFirstWarm: true },
          { id: "ns-relocation", command: "temporal operator namespace create {{project.name}}-{{env.name}}-relocation", envExports: [{ name: "TEMPORAL_RELOCATION_NAMESPACE", value: "{{project.name}}-{{env.name}}-relocation" }], onlyFirstWarm: true },
        ],
      },
      {
        id: "test-postgres",
        displayName: "Test Postgres",
        start: { command: "docker run --rm --name dust-hive-test-postgres -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:14" },
        readiness: { type: "tcp", port: "5433" },
        cliSubcommand: "test-db",
        perEnvSetup: [
          { id: "create-db", command: "createdb -h localhost -p 5433 -U test dust_front_test_{{env.name}}", envExports: [{ name: "TEST_FRONT_DATABASE_URI", value: "postgres://test:test@localhost:5433/dust_front_test_{{env.name}}" }], onlyFirstWarm: true },
        ],
      },
      {
        id: "test-redis",
        displayName: "Test Redis",
        start: { command: "docker run --rm --name dust-hive-test-redis -p 6479:6379 redis:latest" },
        readiness: { type: "tcp", port: "6479" },
        globalEnvExports: [{ name: "TEST_REDIS_URI", value: "redis://localhost:6479" }],
      },
    ],
  },

  commands: [dustSyncCommand, dustSeedConfigCommand],
});
```

### Example 2: Simple Node Monorepo

```typescript
// hive.config.ts
import { defineConfig } from "@dust-tt/hive";

export default defineConfig({
  project: { name: "acme" },

  ports: {
    offsets: { web: 0, api: 1, postgres: 432, redis: 379 },
  },

  services: {
    order: ["web", "api"],
    definitions: {
      web: {
        cwd: "apps/web",
        start: { runner: { type: "node", command: "npm run dev", useNvm: true }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.web}}/" },
        ports: { primary: "web" },
      },
      api: {
        cwd: "apps/api",
        start: { runner: { type: "node", command: "npm run dev", useNvm: true }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.api}}/health" },
        ports: { primary: "api" },
        dependsOn: ["docker:db"],
      },
    },
  },

  env: {
    secretsFile: "~/.acme-hive/config.env",
    exports: [
      { name: "WEB_PORT", value: "{{ports.web}}" },
      { name: "API_PORT", value: "{{ports.api}}" },
      { name: "DATABASE_URL", value: "postgres://dev:dev@localhost:{{ports.postgres}}/acme" },
      { name: "REDIS_URL", value: "redis://localhost:{{ports.redis}}" },
    ],
  },

  docker: {
    baseComposePath: "./docker-compose.yml",
    overrides: {
      db: { ports: [{ host: "{{ports.postgres}}", container: 5432 }] },
      redis: { ports: [{ host: "{{ports.redis}}", container: 6379 }] },
    },
  },

  init: {
    waitFor: [{ id: "postgres", type: "dockerHealth", dockerService: "db" }],
    tasks: [
      { id: "migrate", dependsOn: ["postgres"], runner: { type: "shell", cwd: "apps/api", command: "npm run db:migrate", bootstrap: { sourceEnvFile: true, sourceNvm: true } } },
    ],
  },
});
```

### Example 3: Go Microservices

```typescript
// hive.config.ts
import { defineConfig } from "@dust-tt/hive";

export default defineConfig({
  project: { name: "platform" },

  ports: {
    base: 15000,
    offsets: { gateway: 0, users: 1, orders: 2, postgres: 432 },
  },

  services: {
    order: ["gateway", "users", "orders"],
    definitions: {
      gateway: {
        cwd: "services/gateway",
        start: { runner: { type: "go", command: "go run ./cmd/gateway" }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "tcp", port: "{{ports.gateway}}" },
        ports: { primary: "gateway" },
      },
      users: {
        cwd: "services/users",
        start: { runner: { type: "go", command: "go run ./cmd/users" }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.users}}/health" },
        ports: { primary: "users" },
        dependsOn: ["docker:db"],
      },
      orders: {
        cwd: "services/orders",
        start: { runner: { type: "go", command: "go run ./cmd/orders" }, bootstrap: { sourceEnvFile: true } },
        readiness: { type: "http", url: "http://localhost:{{ports.orders}}/health" },
        ports: { primary: "orders" },
        dependsOn: ["docker:db"],
      },
    },
  },

  env: {
    secretsFile: "~/.platform-hive/secrets.env",
    exports: [
      { name: "GATEWAY_PORT", value: "{{ports.gateway}}" },
      { name: "USERS_PORT", value: "{{ports.users}}" },
      { name: "ORDERS_PORT", value: "{{ports.orders}}" },
      { name: "DB_DSN", value: "postgres://dev:dev@localhost:{{ports.postgres}}/platform?sslmode=disable" },
    ],
  },

  docker: {
    baseComposePath: "./docker-compose.yml",
    overrides: {
      postgres: { ports: [{ host: "{{ports.postgres}}", container: 5432 }] },
    },
  },
  // No managedServices - this project doesn't need Temporal or shared test DBs
});
```

---

## Open Questions

### Resolved

| Question | Decision | Rationale |
|----------|----------|-----------|
| Config format | TypeScript only | Type safety, IDE support, Bun ecosystem |
| Distribution | Library approach | Teams own their CLI |
| Worktrees | Required | Simpler, matches current behavior |
| Module power | Code + Config | Needed for complex customization |
| Managed services | Core concept | Consistent `up/down` semantics |

### Still Open

1. **Dependency strategy plugin vs. built-in**: Should `shallowNodeModules` be a built-in strategy or require a plugin?

2. **Init runner extensibility**: How many init runners should be built-in vs. plugin-provided?

3. **Multiplexer as optional**: Should multiplexer support be an optional plugin for teams that don't need it?

4. **Config file discovery**: Should we look for `hive.config.ts` in repo root, or require explicit path?

5. **Versioning**: How do we handle config schema evolution across framework versions?

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Environment** | An isolated instance with its own worktree, port range, and Docker volumes |
| **Worktree** | A git worktree providing an isolated checkout of the repository |
| **Warm** | Start all services for an environment |
| **Cool** | Stop services but keep SDK running (fast restart) |
| **Spawn** | Create a new environment (worktree + initial setup) |
| **Managed Services** | Global services (Temporal, test DBs) shared across environments |
| **Multiplexer** | Terminal multiplexer (zellij/tmux) for viewing logs |

---

*This document is a living specification. Updates will be made as implementation progresses and decisions are refined.*
