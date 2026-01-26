# Northflank Sandbox Session State

This document captures all learnings, issues, and solutions discovered during the Northflank sandbox exploration session.

---

## 1. Account & Cluster Setup

### Your Northflank Setup
- **Team**: dust
- **Project**: `dust-sandbox-dev` (already exists, use this)
- **Cluster**: `northflank-dev-kube` (BYOC cluster on GCP)
- **Region**: `us-central1`
- **Namespace**: `ns-l7zszcl8qwgd`

### API Token
- Token stored in Northflank CLI context named `dust-sandbox-dev`
- Token has permissions for: Projects, Services, Tags (added during session)
- Token does NOT have: Cloud Cluster read permissions

### Critical: Spot Nodes Only
**Your cluster only has spot nodes configured.** All workloads MUST be tagged with a spot-enabled tag.

- **Existing tag**: `spot-workload` (has `useSpotNodes: true`)
- **Error if missing**: `"Workload is not tagged as spot, but cluster has only spot nodes configured"`

---

## 2. SDK Details

### Package Versions
```json
{
  "@northflank/js-client": "^0.8.10",
  "@northflank/cli": "^0.10.13"
}
```

### SDK is NOT Open Source
- The `@northflank/js-client` npm package is not on GitHub
- However, the npm package contains full TypeScript type definitions (32,858 lines)
- Types are at: `node_modules/@northflank/js-client/dist/esm/api-client.d.ts`

### Key SDK Structure
```typescript
const api = new ApiClient(contextProvider);

// Namespaces available:
api.get.*        // Fetch resources
api.list.*       // List with pagination
api.create.*     // Create resources
api.delete.*     // Delete resources
api.exec.*       // Command execution
api.logs.*       // Log streaming
api.metrics.*    // Metrics
api.fileCopy.*   // File upload/download (USE THIS, not api.upload/download)
api.forwarding.* // Port forwarding
```

---

## 3. Issues Encountered & Solutions

### Issue 1: Project Creation Fails with "Region not found"
**Error**: `Failed to create project: Region not found`

**Cause**: Unknown - possibly BYOC clusters don't allow API project creation, or region format issue.

**Solution**: Use existing project instead of creating new ones.
```typescript
const CONFIG = {
  existingProjectId: "dust-sandbox-dev",  // Use existing project
};
```

### Issue 2: Spot Node Requirement
**Error**: `Workload is not tagged as spot, but cluster has only spot nodes configured`

**Cause**: Cluster has only spot nodes, all services need spot tag.

**Solution**: Add the `spot-workload` tag to service creation:
```typescript
data: {
  name: serviceName,
  tags: ["spot-workload"],  // Required!
  // ...
}
```

### Issue 3: Exec Command Format
**Error**: `bash: echo 'Hello': No such file or directory`

**Cause**: When using `shell: "bash"`, the SDK runs `bash "command string"` which bash interprets as a script filename.

**Solution**: Use `shell: "none"` and wrap with `bash -c`:
```typescript
// WRONG:
{ command: "echo hello", shell: "bash" }

// CORRECT:
{ command: ["bash", "-c", "echo hello"], shell: "none" }
```

### Issue 4: File Upload/Download API Path
**Error**: `Cannot read properties of undefined (reading 'files')`

**Cause**: Wrong API path. The types show `api.upload.serviceStream.files` but it doesn't work.

**Solution**: Use `api.fileCopy.*` directly:
```typescript
// WRONG:
await api.upload.serviceStream.files(...)
await api.download.serviceStream.files(...)

// CORRECT:
await api.fileCopy.uploadServiceFileStream(...)
await api.fileCopy.downloadServiceFileStream(...)
```

### Issue 5: CLI Interactive Prompts
**Problem**: CLI commands like `northflank get projects` prompt for selection, blocking automation.

**Solution**: Always pass explicit IDs:
```bash
# Use explicit flags
northflank get service --projectId dust-sandbox-dev --serviceId my-service -o json
```

### Issue 6: CLI Delete Confirmation
**Problem**: `northflank delete service` prompts for confirmation.

**Solution**: Pipe "y" to stdin:
```bash
echo "y" | northflank delete service --project dust-sandbox-dev --service my-service
```

### Issue 7: Service Status Structure
**Problem**: Service status is not a simple string.

**Actual Structure**:
```typescript
status: {
  deployment?: {
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    reason: 'SCALING' | 'DEPLOYING';
    lastTransitionTime?: string;
  };
  build?: {
    status: 'QUEUED' | 'PENDING' | 'BUILDING' | 'SUCCESS' | 'FAILURE' | ...;
    lastTransitionTime?: string;
  };
}
```

**Check for ready**: `status.deployment?.status === 'COMPLETED'`

### Issue 8: CLI Exec Output Not Shown
**Problem**: `northflank exec service --cmd '...'` doesn't show output in non-TTY mode.

**Workaround**: Use the SDK for programmatic exec, or check logs. The CLI is designed for interactive use.

---

## 4. Working Configuration

### sandbox.ts CONFIG
```typescript
const CONFIG = {
  baseImage: "ubuntu:22.04",
  deploymentPlan: "nf-compute-20",
  existingProjectId: "dust-sandbox-dev",  // Use existing project
  spotTag: "spot-workload",               // Required for spot-only cluster
  defaultRegion: "us-central1",
  serviceReadyTimeoutMs: 120000,
  pollIntervalMs: 3000,
};
```

### Service Creation Payload
```typescript
{
  name: serviceName,
  tags: [CONFIG.spotTag],  // Required!
  billing: {
    deploymentPlan: CONFIG.deploymentPlan,
  },
  deployment: {
    instances: 1,
    external: {
      imagePath: CONFIG.baseImage,
    },
    docker: {
      configType: "customCommand",
      customCommand: "sleep infinity",  // Keep container running
    },
  },
}
```

---

## 5. API Patterns

### Authentication
```typescript
import { ApiClient, ApiClientInMemoryContextProvider } from "@northflank/js-client";

const contextProvider = new ApiClientInMemoryContextProvider();
await contextProvider.addContext({
  name: "default",
  token: process.env.NORTHFLANK_API_TOKEN!,
});
const api = new ApiClient(contextProvider);
```

### Execute Command (Simple)
```typescript
const result = await api.exec.execServiceCommand(
  { projectId, serviceId },
  {
    command: ["bash", "-c", "echo hello && ls -la"],
    shell: "none",
  }
);
console.log(result.stdOut);
console.log(result.commandResult.exitCode);
```

### Execute Command (Streaming)
```typescript
const session = await api.exec.execServiceSession(
  { projectId, serviceId },
  {
    command: ["bash", "-c", command],
    shell: "none",
    tty: false,
  }
);

session.stdOut.on("data", (chunk) => process.stdout.write(chunk));
session.stdErr.on("data", (chunk) => process.stderr.write(chunk));
session.on("command-result", (result) => console.log("Exit:", result.exitCode));
session.on("command-completed", () => console.log("Done"));
```

### Upload File
```typescript
await api.fileCopy.uploadServiceFileStream(
  { projectId, serviceId },
  {
    source: Buffer.from("file content"),
    remotePath: "/tmp/file.txt",
  }
);
```

### Download File
```typescript
const { fileStream, completionPromise } = await api.fileCopy.downloadServiceFileStream(
  { projectId, serviceId },
  { remotePath: "/tmp/file.txt" }
);

const chunks: Buffer[] = [];
fileStream.on("data", (chunk) => chunks.push(chunk));
await completionPromise;
const content = Buffer.concat(chunks);
```

### Stream Logs
```typescript
const logsClient = await api.logs.tailServiceLogs({
  parameters: { projectId, serviceId },
  options: { startTime: new Date() },
});

logsClient.on("logs-received", (lines) => {
  lines.forEach((line) => console.log(line.ts, line.log));
});

await logsClient.start();
// Later: await logsClient.stop();
```

---

## 6. CLI Commands Reference

### Setup
```bash
npm install -g @northflank/cli
northflank login --token-login -t "YOUR_TOKEN" -n dust-sandbox
```

### List Resources
```bash
northflank get projects -o json
northflank get services --projectId dust-sandbox-dev -o json
```

### Create Service
```bash
northflank create service deployment \
  --projectId dust-sandbox-dev \
  --input '{
    "name": "my-service",
    "tags": ["spot-workload"],
    "billing": {"deploymentPlan": "nf-compute-20"},
    "deployment": {
      "instances": 1,
      "external": {"imagePath": "ubuntu:22.04"},
      "docker": {"configType": "customCommand", "customCommand": "sleep infinity"}
    }
  }' -o json
```

### Execute Command
```bash
northflank exec service \
  --project dust-sandbox-dev \
  --service my-service \
  --cmd 'echo hello' \
  --shell-cmd 'bash -c'
```

### File Transfer
```bash
# Upload
northflank upload service file \
  --project dust-sandbox-dev \
  --service my-service \
  --local /local/path \
  --remote /remote/path

# Download
northflank download service file \
  --project dust-sandbox-dev \
  --service my-service \
  --remote /remote/path \
  --local /local/path
```

### Delete Service
```bash
echo "y" | northflank delete service \
  --project dust-sandbox-dev \
  --service my-service
```

---

## 7. File Structure

```
northflank-sandbox/
├── CLAUDE.md                          # Points to AGENTS.md
├── AGENTS.md                          # Points to AGENTS.local.md
├── AGENTS.local.md                    # dust-hive skill instruction
├── NORTHFLANK_API_GUIDE.md            # Quick start guide
├── NORTHFLANK_TECHNICAL_REFERENCE.md  # Deep technical reference
├── NORTHFLANK_SESSION_STATE.md        # This file
└── northflank-sdk-analysis/
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    ├── src/
    │   └── sandbox.ts                 # Main sandbox script (working!)
    └── node_modules/
        └── @northflank/
            ├── js-client/             # SDK with types
            └── cli/                   # CLI tool
```

---

## 8. Next Steps / TODO

1. **MCP Server**: Build the actual MCP server that wraps this sandbox functionality
2. **Base Image**: Consider creating a custom base image with common tools pre-installed
3. **Timeouts**: Add configurable timeouts for long-running commands
4. **Resource Limits**: Explore different deployment plans for different use cases
5. **Networking**: Investigate if sandboxes need network access or should be isolated
6. **Persistence**: Consider adding volume support for stateful sandboxes

---

## 9. Useful Links

- [Northflank API Docs](https://northflank.com/docs/v1/api/introduction)
- [JS Client Docs](https://northflank.com/docs/v1/api/use-the-javascript-client)
- [Execute Commands API](https://northflank.com/docs/v1/api/execute-command)
- [Log Tailing API](https://northflank.com/docs/v1/api/log-tailing)
- [Sandbox/MicroVM Blog](https://northflank.com/blog/how-to-spin-up-a-secure-code-sandbox-and-microvm-in-seconds-with-northflank-firecracker-gvisor-kata-clh)
- [Pricing](https://northflank.com/pricing)
