# Northflank Sandbox

Scripts for creating and managing Northflank sandbox VMs.

## Setup

```bash
cd northflank-sdk-analysis
npm install
```

## Configuration

Edit `src/sandbox.ts` and update the `CONFIG` object:

```typescript
const CONFIG = {
  baseImage: "ubuntu:22.04",      // Docker image for sandbox
  deploymentPlan: "nf-compute-20", // Compute plan (smallest)
  clusterId: "",                   // Your BYOC cluster ID (optional)
  defaultRegion: "us-central1",    // Region to use
  // ...
};
```

## Usage

### 1. Get your API token

1. Go to Northflank Team Settings → API
2. Create an API Role with permissions:
   - Projects: create, read, delete
   - Services: create, read, delete, exec
   - Volumes (optional): create, read, delete
3. Generate a token with that role

### 2. Discover available clusters/regions

```bash
NORTHFLANK_API_TOKEN=<your-token> npm run sandbox:discover
```

### 3. Run the full demo

```bash
NORTHFLANK_API_TOKEN=<your-token> npm run sandbox:run
```

This will:
1. Create a project and service (sandbox VM)
2. Wait for it to be ready
3. Execute a simple command
4. Execute a command with streaming output
5. Upload a file to the sandbox
6. Execute the uploaded script
7. Download a file from the sandbox
8. Clean up (delete project)

## Using as a Library

```typescript
import { NorthflankSandbox } from './src/sandbox';

const sandbox = new NorthflankSandbox(process.env.NORTHFLANK_API_TOKEN!);

// Create sandbox
await sandbox.create();

// Execute commands
const result = await sandbox.exec('echo hello');
console.log(result.stdout);

// Stream command output
await sandbox.execStreaming('long-running-command',
  (stdout) => console.log(stdout),
  (stderr) => console.error(stderr)
);

// Upload/download files
await sandbox.uploadContent('file content', '/tmp/file.txt');
const content = await sandbox.downloadContent('/tmp/file.txt');

// Cleanup
await sandbox.destroy();
```

## API Reference

### `NorthflankSandbox`

#### Constructor
```typescript
new NorthflankSandbox(apiToken: string)
```

#### Methods

| Method | Description |
|--------|-------------|
| `create(options?)` | Create a new sandbox VM |
| `exec(command)` | Execute command, return result |
| `execStreaming(command, onStdout?, onStderr?)` | Execute with streaming output |
| `uploadFile(localPath, remotePath)` | Upload local file |
| `uploadContent(content, remotePath)` | Upload content directly |
| `downloadFile(remotePath, localPath)` | Download to local file |
| `downloadContent(remotePath)` | Download and return content |
| `streamLogs(onLog, options?)` | Stream container logs |
| `destroy()` | Shutdown and cleanup |
| `listClusters()` | List available BYOC clusters |
| `listRegions()` | List available regions |
