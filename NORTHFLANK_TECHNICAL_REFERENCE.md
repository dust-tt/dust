# Northflank Technical Reference

Deep technical analysis of the Northflank SDK (`@northflank/js-client` v0.8.10) and CLI (`@northflank/cli` v0.10.13).

---

## Table of Contents

1. [SDK Overview](#1-sdk-overview)
2. [Authentication](#2-authentication)
3. [Exec Protocol (Command Execution)](#3-exec-protocol-command-execution)
4. [Log Streaming Protocol](#4-log-streaming-protocol)
5. [File Transfer](#5-file-transfer)
6. [Port Forwarding](#6-port-forwarding)
7. [API Methods Reference](#7-api-methods-reference)
8. [Code Examples](#8-code-examples)

---

## 1. SDK Overview

### Installation

```bash
npm install @northflank/js-client
```

### Package Structure

- **Node requirement**: >= 18.0.0
- **Exports**: Both CommonJS and ESM
- **Type definitions**: Full TypeScript support (32,858 lines of types)

### Key Dependencies

- `ws` (^8.18.3) - WebSocket for streaming
- `node-fetch` (2.6.7) - HTTP requests
- `tar` (^7.5.6) - File compression for uploads/downloads

### Client Architecture

The `ApiClient` is organized into logical namespaces:

| Namespace | Purpose |
|-----------|---------|
| `get` | Fetch individual resources |
| `list` | List resources with pagination |
| `create` | Create new resources |
| `put` | Replace entire resources |
| `patch` | Update partial resources |
| `delete` | Remove resources |
| `scale` | Scale services/addons/jobs |
| `restart` | Restart services/addons |
| `pause`/`resume` | Control resource state |
| `logs` | Fetch and stream logs |
| `metrics` | Retrieve performance metrics |
| `exec` | Execute commands remotely |
| `download`/`upload` | File operations |
| `forwarding` | Port forwarding tunnels |

---

## 2. Authentication

### Context Provider System

```typescript
import { ApiClient, ApiClientInMemoryContextProvider } from '@northflank/js-client';

// In-memory context (for scripts)
const contextProvider = new ApiClientInMemoryContextProvider();
await contextProvider.addContext({
  name: 'production',
  token: process.env.NORTHFLANK_API_TOKEN!,
  host: 'https://api.northflank.com',  // optional, this is default
});

const api = new ApiClient(contextProvider);
```

### Context Structure

```typescript
interface ApiClientContext {
  name: string;           // Named context identifier
  token: string;          // API token for authentication
  host: string;           // Northflank API base URL
  project?: string;       // Default project ID
  service?: string;       // Default service ID
  job?: string;           // Default job ID
}
```

### Dynamic Context Switching

```typescript
api.useContext('staging');      // Switch context
api.useProjectId('proj-123');   // Set default project
api.useServiceId('svc-456');    // Set default service
```

### API Token

- Created in Northflank Team Settings → API → Create Role → Generate Token
- Passed as Bearer token: `Authorization: Bearer <token>`
- Rate limit: 1000 requests/hour (can request increase)

---

## 3. Exec Protocol (Command Execution)

### Overview

The exec system uses WebSocket for bidirectional communication with containers. Supports both interactive shells and one-off commands.

### Two Execution Modes

#### Mode 1: Fire-and-Forget Commands

Returns aggregated results after command completes.

```typescript
const result = await api.exec.execServiceCommand(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  {
    command: ['ls', '-la', '/app'],
    shell: 'none',  // or 'bash', 'sh'
  }
);

console.log(result.stdOut);      // Command output
console.log(result.stdErr);      // Error output
console.log(result.commandResult.exitCode);  // Exit code
```

#### Mode 2: Interactive Sessions

Streams I/O in real-time, supports interactive shells.

```typescript
const session = await api.exec.execServiceSession(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  {
    tty: true,
    ttyRows: 24,
    ttyColumns: 80,
    shell: 'bash',
  },
  (commandInfo) => console.log('Command started:', commandInfo)
);

// Pipe streams
process.stdin.pipe(session.stdIn);
session.stdOut.pipe(process.stdout);
session.stdErr.pipe(process.stderr);

// Handle completion
session.on('command-result', (result) => {
  console.log('Exit code:', result.exitCode);
});
```

### ExecCommandStandard Class

```typescript
interface ExecCommandStandard extends EventEmitter {
  // Streams
  stdOut: PassThrough;    // Readable stream for stdout
  stdErr: PassThrough;    // Readable stream for stderr
  stdIn: PassThrough;     // Writable stream for stdin

  // Methods
  start(): Promise<void>;
  resizeTerminal(size: { rows?: number; columns?: number }): void;

  // Events
  on(event: 'auth-success', listener: () => void): this;
  on(event: 'command-started', listener: (info: CommandInfo) => void): this;
  on(event: 'command-completed', listener: () => void): this;
  on(event: 'command-result', listener: (result: CommandResult) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}
```

### WebSocket Message Types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `auth-success` | Server→Client | Authentication succeeded |
| `command-started` | Server→Client | Command execution began |
| `command-completed` | Server→Client | Command finished |
| `command-result` | Server→Client | Exit code and status |
| `std-out-data` | Server→Client | Stdout data |
| `std-err-data` | Server→Client | Stderr data |
| `stdInEnd` | Client→Server | Signal end of stdin |
| `resize` | Client→Server | Terminal resize |

### Exec Options

```typescript
interface ExecSessionData {
  command?: string | string[];   // Command to execute
  shell?: 'bash' | 'sh' | 'none'; // Shell interpreter
  tty?: boolean;                  // Enable TTY mode
  ttyRows?: number;               // Terminal rows
  ttyColumns?: number;            // Terminal columns
  user?: string | number;         // Run as user
  group?: string | number;        // Run as group
  encoding?: string;              // Character encoding
}
```

### Supported Entities

- Services: `execServiceSession()` / `execServiceCommand()`
- Jobs: `execJobSession()` / `execJobCommand()`
- Addons: `execAddonSession()` / `execAddonCommand()`

### Container Selection

```typescript
{
  instanceName?: string;    // Specific instance (random if unspecified)
  containerName?: string;   // Specific container (first if unspecified)
}
```

---

## 4. Log Streaming Protocol

### Overview

Two modes: **Range queries** (HTTP REST) and **Tail streaming** (WebSocket).

### Log Data Structure

```typescript
type LogLine = {
  containerId: string;   // Container identifier
  log: any;              // Log content
  ts: Date;              // Timestamp (ISO 8601)
};
```

### Range Query (Historical Logs)

```typescript
const logs = await api.logs.getServiceLogs({
  parameters: { projectId: 'proj-123', serviceId: 'svc-456' },
  options: {
    startTime: new Date(Date.now() - 3600000),  // 1 hour ago
    endTime: new Date(),
    direction: 'backward',
    lineLimit: 100,
    textIncludes: 'error',  // Filter logs containing "error"
  },
});

logs.data.forEach(line => console.log(line.ts, line.log));
```

### Live Tailing (WebSocket)

```typescript
const logsClient = await api.logs.tailServiceLogs({
  parameters: { projectId: 'proj-123', serviceId: 'svc-456' },
  options: {
    startTime: new Date(),
    containerName: 'main',
    types: ['runtime'],  // 'cdn', 'mesh', 'ingress', 'runtime'
  },
});

logsClient.on('logs-received', (logLines) => {
  logLines.forEach(line => console.log(line.ts, line.log));
});

logsClient.on('error', (err) => console.error('Log error:', err));
logsClient.on('close', () => console.log('Log stream closed'));

await logsClient.start();

// Later: stop streaming
await logsClient.stop();
```

### Filtering Options

```typescript
interface LogsRequestData {
  // Time filtering
  startTime?: Date;
  endTime?: Date;           // Range only
  duration?: number;        // Range only (seconds)
  direction?: 'forward' | 'backward';  // Range only

  // Container filtering
  containerName?: string;   // Or 'all'

  // Log type filtering (service/job only)
  types?: ('cdn' | 'mesh' | 'ingress' | 'runtime')[];

  // Text filtering (mutually exclusive)
  textIncludes?: string;
  textNotIncludes?: string;
  regexIncludes?: string;
  regexNotIncludes?: string;

  // Pagination
  lineLimit?: number;
}
```

### LogsClient Events

| Event | Payload | Description |
|-------|---------|-------------|
| `logs-received` | `LogLine[]` | Batch of new log lines |
| `open` | - | WebSocket connected |
| `close` | - | WebSocket closed |
| `error` | `Error` | Connection/processing error |

---

## 5. File Transfer

### Overview

Upload and download files/directories to/from containers using tar streams.

### Download Files

```typescript
// Download to local path
const result = await api.download.downloadServiceFiles(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  {
    localPath: '/local/destination',
    remotePath: '/app/data',
    containerName: 'main',
  }
);

// Or get a stream
const { fileStream, completionPromise } = await api.download.downloadServiceFileStream(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  {
    remotePath: '/app/config.json',
    containerName: 'main',
  }
);

fileStream.pipe(fs.createWriteStream('/local/config.json'));
await completionPromise;
```

### Upload Files

```typescript
// Upload from local path
await api.upload.uploadServiceFiles(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  {
    localPath: '/local/source',
    remotePath: '/app/uploads',
    containerName: 'main',
    ignoreList: ['node_modules', '.git'],  // Exclude patterns
  }
);

// Or upload from stream/buffer
await api.upload.uploadServiceFileStream(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  {
    source: Buffer.from('file contents'),
    remotePath: '/app/data/file.txt',
    containerName: 'main',
  }
);
```

### Copy Types

- `FILE_DOWNLOAD` - Single file from container
- `FILE_UPLOAD` - Single file to container
- `DIRECTORY_DOWNLOAD` - Directory tree from container
- `DIRECTORY_UPLOAD` - Directory tree to container

---

## 6. Port Forwarding

### Overview

Create local TCP/UDP tunnels to container ports.

### Forward Service Ports

```typescript
const forwards = await api.forwarding.forwardService(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  false  // ipOnly: false means also register hostnames
);

forwards.forEach(fwd => {
  console.log(`${fwd.portName}: localhost:${fwd.port} -> ${fwd.address}`);
});

// Use with auto-cleanup
const result = await api.forwarding.withServiceForwarding(
  { projectId: 'proj-123', serviceId: 'svc-456' },
  async (forwards) => {
    // forwards are active here
    const response = await fetch(`http://localhost:${forwards[0].port}/api/health`);
    return response.json();
  }
);
// forwards automatically cleaned up
```

### PortForwardingResult

```typescript
type PortForwardingInfo = {
  type: 'addon' | 'service';
  projectId: string;
  id: string;
  address: string;
  port: number;
  portName?: string;
  protocol?: 'HTTP' | 'TCP' | 'UDP';
  hostnames: string[];
  ipOnly: boolean;
};
```

---

## 7. API Methods Reference

### Projects

```typescript
api.create.project({ data: { name, region, description } })
api.get.project({ parameters: { projectId } })
api.list.projects({})
api.patch.project({ parameters: { projectId }, data: {...} })
api.delete.project({ parameters: { projectId } })
```

### Services

```typescript
// Create deployment service (from registry image)
api.create.service.deployment({
  parameters: { projectId },
  data: {
    name: 'my-service',
    billing: { deploymentPlan: 'nf-compute-20' },
    deployment: {
      instances: 1,
      external: { imagePath: 'ubuntu:22.04' },
    },
  },
})

// Scale service
api.scale.service({
  parameters: { projectId, serviceId },
  data: { instances: 3 },
})

// Restart service
api.restart.service({ parameters: { projectId, serviceId } })

// Pause/Resume
api.pause.service({ parameters: { projectId, serviceId } })
api.resume.service({ parameters: { projectId, serviceId } })

// Delete
api.delete.service({ parameters: { projectId, serviceId } })
```

### Volumes

```typescript
api.create.volume({
  parameters: { projectId },
  data: {
    name: 'data-volume',
    storageClass: 'ssd',
    storage: 4096,  // MB
  },
})

// Attach to service
api.patch.volume({
  parameters: { projectId, volumeId },
  data: {
    attachedTo: {
      serviceId: 'svc-123',
      mountPath: '/data',
    },
  },
})
```

### Addons (Databases, etc.)

```typescript
api.create.addon({
  parameters: { projectId },
  data: {
    name: 'my-postgres',
    type: 'postgresql',
    version: '15',
    billing: { deploymentPlan: 'nf-compute-50', storage: 10240 },
  },
})

// Get connection credentials
api.get.addon.credentials({ parameters: { projectId, addonId } })

// Backup/restore
api.backup.addon({ parameters: { projectId, addonId } })
api.restore.addon({ parameters: { projectId, addonId }, data: { backupId } })
```

### Metrics

```typescript
// Single point metrics
api.metrics.getServiceMetrics({
  parameters: { projectId, serviceId },
  options: { metricTypes: ['cpu', 'memory'] },
})

// Time range metrics
api.metrics.getServiceMetricsRange({
  parameters: { projectId, serviceId },
  options: {
    startTime: new Date(Date.now() - 3600000),
    endTime: new Date(),
    metricTypes: ['cpu', 'memory', 'networkIngress', 'networkEgress'],
  },
})
```

---

## 8. Code Examples

### Complete Sandbox Lifecycle

```typescript
import { ApiClient, ApiClientInMemoryContextProvider } from '@northflank/js-client';

async function runSandbox() {
  // Setup client
  const ctx = new ApiClientInMemoryContextProvider();
  await ctx.addContext({
    name: 'default',
    token: process.env.NORTHFLANK_API_TOKEN!,
  });
  const api = new ApiClient(ctx);

  // Create project
  const project = await api.create.project({
    data: {
      name: 'sandbox-test',
      region: 'europe-west',
    },
  });
  const projectId = project.data.id;
  console.log('Created project:', projectId);

  try {
    // Create service
    const service = await api.create.service.deployment({
      parameters: { projectId },
      data: {
        name: 'sandbox-instance',
        billing: { deploymentPlan: 'nf-compute-20' },
        deployment: {
          instances: 1,
          external: { imagePath: 'ubuntu:22.04' },
        },
      },
    });
    const serviceId = service.data.id;
    console.log('Created service:', serviceId);

    // Wait for service to be ready
    await waitForServiceReady(api, projectId, serviceId);

    // Execute a command
    const result = await api.exec.execServiceCommand(
      { projectId, serviceId },
      { command: ['echo', 'Hello from sandbox!'], shell: 'none' }
    );
    console.log('Command output:', result.stdOut);
    console.log('Exit code:', result.commandResult.exitCode);

    // Stream logs
    const logsClient = await api.logs.tailServiceLogs({
      parameters: { projectId, serviceId },
      options: { lineLimit: 10 },
    });

    logsClient.on('logs-received', (lines) => {
      lines.forEach(l => console.log('[LOG]', l.log));
    });

    await logsClient.start();

    // Run another command
    await api.exec.execServiceCommand(
      { projectId, serviceId },
      { command: ['ls', '-la', '/'], shell: 'none' }
    );

    // Wait a bit for logs
    await new Promise(r => setTimeout(r, 2000));
    await logsClient.stop();

  } finally {
    // Cleanup
    await api.delete.project({ parameters: { projectId } });
    console.log('Cleaned up project');
  }
}

async function waitForServiceReady(api, projectId, serviceId, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const svc = await api.get.service({ parameters: { projectId, serviceId } });
    if (svc.data.status === 'running') return;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Service did not become ready in time');
}

runSandbox().catch(console.error);
```

### Interactive Shell Session

```typescript
import { ApiClient, ApiClientInMemoryContextProvider } from '@northflank/js-client';
import * as readline from 'readline';

async function interactiveShell(projectId: string, serviceId: string) {
  const ctx = new ApiClientInMemoryContextProvider();
  await ctx.addContext({ name: 'default', token: process.env.NORTHFLANK_API_TOKEN! });
  const api = new ApiClient(ctx);

  const session = await api.exec.execServiceSession(
    { projectId, serviceId },
    {
      tty: true,
      ttyRows: process.stdout.rows || 24,
      ttyColumns: process.stdout.columns || 80,
      shell: 'bash',
    }
  );

  // Handle terminal resize
  process.stdout.on('resize', () => {
    session.resizeTerminal({
      rows: process.stdout.rows,
      columns: process.stdout.columns,
    });
  });

  // Pipe I/O
  process.stdin.setRawMode(true);
  process.stdin.pipe(session.stdIn);
  session.stdOut.pipe(process.stdout);
  session.stdErr.pipe(process.stderr);

  session.on('command-result', (result) => {
    process.stdin.setRawMode(false);
    console.log('\nSession ended with exit code:', result.exitCode);
    process.exit(result.exitCode);
  });

  session.on('error', (err) => {
    console.error('Session error:', err);
    process.exit(1);
  });
}
```

---

## Summary

The Northflank SDK provides:

1. **Full REST API coverage** - ~150+ endpoints for all resource types
2. **WebSocket streaming** - Real-time logs and command execution
3. **File transfer** - Upload/download with streaming support
4. **Port forwarding** - Local tunnels to container ports
5. **Comprehensive types** - Full TypeScript support

For sandbox use cases, the key capabilities are:

- **Create sandboxed containers** with VM-level isolation (Kata containers)
- **Execute commands** via WebSocket with full PTY support
- **Stream logs** in real-time
- **Transfer files** to/from containers
- **Programmatic cleanup** when done
