/**
 * Northflank Sandbox Script
 *
 * Demonstrates the complete lifecycle of a sandbox VM:
 * - Authentication
 * - Cluster discovery
 * - VM creation with base image
 * - Command execution with streaming output
 * - File upload/download
 * - Cleanup
 *
 * Usage:
 *   NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts
 *
 * Or with options:
 *   NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts --discover
 *   NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts --cluster-id=my-cluster
 */
declare const CONFIG: {
    baseImage: string;
    deploymentPlan: string;
    clusterId: string;
    defaultRegion: string;
    projectPrefix: string;
    existingProjectId: string;
    spotTag: string;
    serviceReadyTimeoutMs: number;
    pollIntervalMs: number;
};
interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
declare class NorthflankSandbox {
    private api;
    private projectId;
    private serviceId;
    private initPromise;
    constructor(apiToken: string);
    private init;
    private ensureReady;
    /**
     * List available clusters (useful for BYOC setups)
     */
    listClusters(): Promise<Array<{
        id: string;
        name: string;
        region: string;
        status: string;
    }>>;
    /**
     * List available regions
     */
    listRegions(): Promise<Array<{
        id: string;
        name: string;
    }>>;
    /**
     * Create a new sandbox VM
     */
    create(options?: {
        clusterId?: string;
        name?: string;
    }): Promise<void>;
    /**
     * Wait for the service to be in running state
     */
    private waitForReady;
    /**
     * Execute a command and return the result
     */
    exec(command: string | string[]): Promise<CommandResult>;
    /**
     * Execute a command with real-time streaming output
     */
    execStreaming(command: string, onStdout?: (data: string) => void, onStderr?: (data: string) => void): Promise<number>;
    /**
     * Upload a file to the sandbox
     */
    uploadFile(localPath: string, remotePath: string): Promise<void>;
    /**
     * Upload content directly to the sandbox
     */
    uploadContent(content: string | Buffer, remotePath: string): Promise<void>;
    /**
     * Download a file from the sandbox
     */
    downloadFile(remotePath: string, localPath: string): Promise<void>;
    /**
     * Download a file and return its content
     */
    downloadContent(remotePath: string): Promise<Buffer>;
    /**
     * Stream logs from the sandbox
     */
    streamLogs(onLog: (line: {
        timestamp: Date;
        message: string;
    }) => void, options?: {
        durationMs?: number;
    }): Promise<void>;
    /**
     * Shutdown and cleanup the sandbox
     */
    destroy(): Promise<void>;
    getProjectId(): string | null;
    getServiceId(): string | null;
}
export { NorthflankSandbox, CONFIG };
//# sourceMappingURL=sandbox.d.ts.map