// tests/setup.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env.test file if it exists, otherwise from .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testEnvPath = path.resolve(__dirname, '../.env.test');
const defaultEnvPath = path.resolve(__dirname, '../.env');

dotenv.config({ path: testEnvPath });
dotenv.config({ path: defaultEnvPath });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise during tests

// Global test timeout is set in jest.config.ts

// We're not mocking console in this setup to allow for debugging

// Clean up resources after all tests
afterAll(async () => {
  // Add any global cleanup here
});
