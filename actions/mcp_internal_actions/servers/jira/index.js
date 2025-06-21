#!/usr/bin/env node

import createServer from './standalone_server.js';

/**
 * Main entry point for the standalone JIRA MCP Server
 * This creates and starts the MCP server equivalent to the internal one
 */
async function main() {
  const server = createServer();
  
  // Connect to stdin/stdout for MCP communication
  const transport = server.connect({
    inputStream: process.stdin,
    outputStream: process.stdout,
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start JIRA MCP server:', error);
  process.exit(1);
});