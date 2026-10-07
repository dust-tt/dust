// Dev loop for the live session server: rebuild on change, then restart it. Open documents
// live in its memory, so a restart drops them and browsers reconnect.
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import esbuild from "esbuild";

import { BUILD_TARGETS, childEnv, getBaseBuildOptions } from "./esbuild.shared";

const COLLAB_TARGET = BUILD_TARGETS.find(({ name }) => name === "collab");
if (!COLLAB_TARGET) {
  throw new Error("No collab build target.");
}
const target = COLLAB_TARGET;

let child: ChildProcess | null = null;
let shuttingDown = false;
// Stops and starts run one at a time, so two servers never compete for the port.
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task);
  return queue;
}

async function stopChild() {
  const running = child;
  child = null;
  if (!running || running.exitCode !== null || running.signalCode !== null) {
    return;
  }
  const exited = once(running, "exit");
  running.kill("SIGTERM");
  await exited;
}

async function restartChild() {
  await stopChild();
  if (shuttingDown) {
    return;
  }
  child = spawn("node", ["--enable-source-maps", target.outfile], {
    stdio: "inherit",
    env: childEnv(),
  });
}

async function watch() {
  const base = getBaseBuildOptions(target);
  const ctx = await esbuild.context({
    ...base,
    sourcemap: "inline",
    plugins: [
      ...(base.plugins ?? []),
      {
        name: "restart-collab-server",
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length === 0) {
              void enqueue(restartChild);
            }
          });
        },
      },
    ],
  });

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await ctx.dispose();
    await enqueue(stopChild);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await ctx.watch();
}

watch().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
