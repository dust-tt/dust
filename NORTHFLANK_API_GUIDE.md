# Northflank Sandbox API Guide

## Overview

Northflank provides container orchestration with **microVM-level isolation** (Kata containers, Firecracker, gVisor). This makes it suitable for running untrusted code in sandboxes with VM-level security but container startup speed.

---

## Prerequisites & Credentials

### What You Need

1. **API Token** - Generated from Northflank team settings
   - Go to Team Settings → API → Create an API Role (defines permissions)
   - Generate a token with that role
   - Store securely (never commit to repo)

2. **Team/Account** - Already have this set up

3. **Region** - Choose where sandboxes will run (e.g., `europe-west`)

### Authentication

All API requests use Bearer token auth:
```
Authorization: Bearer <NORTHFLANK_API_TOKEN>
```

Base URL: `https://api.northflank.com/v1/`

Rate limit: 1000 requests/hour (can request increase)

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Project** | Container for services, like a namespace |
| **Service** | A running container (deployment or combined build+deploy) |
| **Deployment Service** | Deploy from existing image (Docker Hub, etc.) |
| **Combined Service** | Build from git + deploy |
| **Template** | IaC definition - can define full stack reproducibly |

---

## JavaScript Client

```bash
npm install @northflank/js-client
```

```typescript
import { ApiClient, ApiClientInMemoryContextProvider } from '@northflank/js-client';

const contextProvider = new ApiClientInMemoryContextProvider();
await contextProvider.addContext({
  name: 'default',
  token: process.env.NORTHFLANK_API_TOKEN!,
});

const api = new ApiClient(contextProvider);
```

---

## Core Operations

### 1. Create a Project

```typescript
const project = await api.create.project({
  data: {
    name: 'sandbox-project',
    region: 'europe-west',
    description: 'Sandbox environment for untrusted code',
  },
});
const projectId = project.data.id;
```

### 2. Deploy a Sandbox Container

```typescript
const service = await api.create.service.deployment({
  parameters: { projectId },
  data: {
    name: 'sandbox-instance',
    billing: {
      deploymentPlan: 'nf-compute-20',  // smallest plan
    },
    deployment: {
      instances: 1,
      external: {
        imagePath: 'ubuntu:22.04',  // or custom sandbox image
      },
    },
  },
});
```

**Deployment plans** (nf-compute-XX):
- `nf-compute-20` = 0.2 vCPU, small memory (cheapest)
- `nf-compute-400` = 4 vCPU, 8GB memory
- Scale from 0.1 to 32 vCPU, 256MB to 256GB memory

### 3. Execute Commands in Container

The API supports executing commands via **WebSocket** for interactive shells or one-off commands.

**CLI approach:**
```bash
northflank exec --project <projectId> --service <serviceId>
```

**API approach:** WebSocket connection to exec endpoint. The JS client and API support:
- Spawning shell processes with full container access
- Command completion and history
- Access to environment, filesystem, all processes

Permission required: `Services > Deployment > Command Exec`

### 4. Stream Logs

```typescript
// Via JS client - uses WebSocket under the hood
const logs = await api.get.service.logs({
  parameters: { projectId, serviceId },
  options: {
    // Optional filters
    lineLimit: 100,
    startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
});
```

For live tailing, use WebSocket connection to stream logs as generated.

### 5. Add Persistent Storage (Optional)

```typescript
// Volumes persist data across container restarts
// Note: limits service to 1 instance
await api.create.volume({
  parameters: { projectId },
  data: {
    name: 'sandbox-data',
    storageClass: 'ssd',
    storage: 4096,  // MB
    mountPath: '/data',
    serviceId: serviceId,
  },
});
```

**Volume modes:**
- Single read-write (one container)
- Multi read-write (multiple containers)

### 6. Delete/Cleanup

```typescript
await api.delete.service({
  parameters: { projectId, serviceId },
});

await api.delete.project({
  parameters: { projectId },
});
```

---

## Templates (Infrastructure as Code)

For reproducible sandbox setups, use Northflank templates:

- Define in YAML/JSON
- Version control in git (bidirectional GitOps)
- Can include: project, services, volumes, networking
- Visual editor in UI or code editor
- Shareable via link

Recommended: **Create your sandbox setup in the UI first, then export as template** to understand the structure.

---

## Security Model

Northflank's Kata containers provide:

- **VM-level isolation** - Each container runs in its own microVM
- **Sandboxed kernel** - Separate kernel per container
- **No shared namespaces** (unless explicitly enabled)
- **Container breakout protection** - Even with untrusted code

This is ideal for running user-submitted code safely.

---

## Recommended Next Steps

1. **Get API Token**
   - Log into Northflank → Team Settings → API
   - Create role with permissions: Projects (create/delete), Services (full), Volumes (optional)
   - Generate token

2. **Explore UI First**
   - Create a test project manually
   - Deploy a simple container (e.g., `alpine:latest`)
   - Try the shell/exec feature
   - Look at the template export

3. **Hello World Script**
   - Create project via API
   - Deploy container
   - Execute `echo "hello world"` via exec
   - Read logs
   - Cleanup

---

## Useful Links

- [API Introduction](https://northflank.com/docs/v1/api/introduction)
- [JS Client Docs](https://northflank.com/docs/v1/api/use-the-javascript-client)
- [Execute Commands API](https://northflank.com/docs/v1/api/execute-command)
- [Log Tailing API](https://northflank.com/docs/v1/api/log-tailing)
- [Templates/IaC](https://northflank.com/docs/v1/application/infrastructure-as-code/infrastructure-as-code)
- [Volumes](https://northflank.com/docs/v1/application/databases-and-persistence/add-a-volume)
- [Sandbox/MicroVM Blog](https://northflank.com/blog/how-to-spin-up-a-secure-code-sandbox-and-microvm-in-seconds-with-northflank-firecracker-gvisor-kata-clh)
- [Pricing](https://northflank.com/pricing)
