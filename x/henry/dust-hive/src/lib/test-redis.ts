// Shared test Redis management (global container, not per-environment)
// All environments share the same Redis instance for testing.

import {
  type ContainerConfig,
  isContainerRunning,
  redisReadinessCheck,
  startContainer,
  stopContainer,
} from "./docker-container";
import { TEST_REDIS_CONTAINER_NAME, TEST_REDIS_PORT } from "./paths";

const TEST_REDIS_CONFIG: ContainerConfig = {
  name: TEST_REDIS_CONTAINER_NAME,
  image: "redis:7-alpine",
  port: { host: TEST_REDIS_PORT, container: 6379 },
  readinessCheck: redisReadinessCheck,
};

// Check if the test Redis container is running
export async function isTestRedisRunning(): Promise<boolean> {
  return isContainerRunning(TEST_REDIS_CONTAINER_NAME);
}

// Start the shared test Redis container
export async function startTestRedis(): Promise<{
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}> {
  return startContainer(TEST_REDIS_CONFIG);
}

// Stop the shared test Redis container
export async function stopTestRedis(): Promise<{ success: boolean; wasRunning: boolean }> {
  return stopContainer(TEST_REDIS_CONTAINER_NAME);
}

// Get the connection URI for the test Redis
export function getTestRedisUri(): string {
  return `redis://localhost:${TEST_REDIS_PORT}`;
}
