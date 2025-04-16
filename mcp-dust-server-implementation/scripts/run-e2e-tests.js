#!/usr/bin/env node

/**
 * Script to run end-to-end tests for the MCP Dust Server
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory name using ES modules approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const serverPort = 5002;
const testTimeout = 60000; // 60 seconds
const testDir = path.join(__dirname, '../tests/e2e');
const envFile = path.join(__dirname, '../.env.e2e');

// Check if .env.e2e exists
if (!fs.existsSync(envFile)) {
  console.error(`Error: ${envFile} not found. Please create it first.`);
  process.exit(1);
}

// Check if test directory exists
if (!fs.existsSync(testDir)) {
  console.error(`Error: ${testDir} not found. Please create it first.`);
  process.exit(1);
}

// Check if dist/server.js exists
const serverJsPath = path.join(__dirname, '../dist/server.js');
if (!fs.existsSync(serverJsPath)) {
  console.log('Server not built. Building the project...');
  try {
    // Use execSync for simplicity in this case
    const { execSync } = await import('child_process');
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    console.log('Build completed successfully.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Start the server
console.log('Starting the MCP Dust Server...');
const server = spawn('node', ['--require', 'dotenv/config', serverJsPath], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    MCP_SERVER_PORT: serverPort,
    DOTENV_CONFIG_PATH: envFile,
  },
  stdio: 'pipe',
});

// Handle server output
server.stdout.on('data', data => {
  console.log(`Server: ${data}`);
});

server.stderr.on('data', data => {
  console.error(`Server Error: ${data}`);
});

// Wait for server to start
setTimeout(() => {
  console.log(`Server started on port ${serverPort}`);
  console.log('Running end-to-end tests...');

  // Run the tests using node directly instead of npx
  const jestPath = path.join(__dirname, '../node_modules/.bin/jest');
  const jest = spawn(
    jestPath,
    [
      '--config',
      path.join(__dirname, '../jest.config.ts'),
      '--testMatch',
      '**/tests/e2e/**/*.test.ts',
      '--forceExit',
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        MCP_SERVER_PORT: serverPort,
        DOTENV_CONFIG_PATH: envFile,
      },
      stdio: 'inherit',
      shell: true, // Use shell on Windows
    }
  );

  // Handle test completion
  jest.on('close', code => {
    console.log(`Tests completed with exit code ${code}`);

    // Kill the server
    console.log('Stopping the server...');
    server.kill();

    // Exit with the same code as the tests
    process.exit(code);
  });
}, 5000); // Wait 5 seconds for server to start

// Handle process termination
process.on('SIGINT', () => {
  console.log('Process interrupted. Cleaning up...');
  server.kill();
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('Process terminated. Cleaning up...');
  server.kill();
  process.exit(1);
});
