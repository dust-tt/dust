import { heartbeat } from "@connectors/lib/temporal";
import PQueue from "p-queue";

export const GOOGLE_DRIVE_CONTENT_CONCURRENCY = 2;
const CONTENT_CONCURRENCY_HEARTBEAT_INTERVAL_MS = 60_000;

const contentQueue = new PQueue({
  concurrency: GOOGLE_DRIVE_CONTENT_CONCURRENCY,
});

export async function runWithGoogleDriveContentConcurrency<T>(
  task: () => Promise<T>
): Promise<T> {
  const abortController = new AbortController();
  let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined;
  let heartbeatError: unknown;
  let taskStarted = false;
  let stopped = false;

  const heartbeatPromise = new Promise<never>((_resolve, reject) => {
    const scheduleHeartbeat = () => {
      heartbeatTimeout = setTimeout(() => {
        void heartbeat()
          .then(() => {
            if (!stopped) {
              scheduleHeartbeat();
            }
          })
          .catch((error) => {
            if (!stopped) {
              if (taskStarted) {
                // Keep the queue slot until the underlying content work settles. Aborting a
                // running PQueue task only rejects its wrapper; it cannot cancel the task itself.
                heartbeatError = error;
              } else {
                reject(error);
                abortController.abort();
              }
            }
          });
      }, CONTENT_CONCURRENCY_HEARTBEAT_INTERVAL_MS);
    };

    scheduleHeartbeat();
  });

  const taskPromise = contentQueue.add(
    async () => {
      taskStarted = true;
      return task();
    },
    {
      signal: abortController.signal,
      throwOnTimeout: true,
    }
  );

  try {
    const result = await Promise.race([taskPromise, heartbeatPromise]);
    if (heartbeatError) {
      throw heartbeatError;
    }
    return result;
  } finally {
    stopped = true;
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }
  }
}
