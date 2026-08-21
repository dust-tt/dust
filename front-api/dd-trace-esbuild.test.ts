// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import esbuild from "esbuild";
import { afterEach, describe, expect, it } from "vitest";

import { getBaseBuildOptions } from "./esbuild.shared";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

describe("dd-trace esbuild instrumentation", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((path) => rm(path, { force: true, recursive: true }))
    );
  });

  it("instruments a bundled Hono application", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dust-dd-esbuild-"));
    temporaryDirectories.push(directory);
    const bundlePath = join(directory, "app.cjs");
    const runnerPath = join(directory, "run.cjs");
    const buildOptions = getBaseBuildOptions({
      name: "server",
      entry: "unused.ts",
      outfile: bundlePath,
    });

    await esbuild.build({
      ...buildOptions,
      entryPoints: undefined,
      stdin: {
        contents: `
          import "./lib/tracer-init";
          import { Hono } from "hono";
          const app = new Hono();
          app.get("/test", (context) => context.text("ok"));
          export default app;
        `,
        loader: "js",
        resolveDir: process.cwd(),
        sourcefile: "dd-trace-esbuild-fixture.js",
      },
      logLevel: "silent",
    });

    await writeFile(
      runnerPath,
      `
        const channel = require("node:diagnostics_channel").channel(
          "apm:hono:request:handle"
        );
        const bundledModules = [];
        const loadedInstrumentations = [];
        require("node:diagnostics_channel")
          .channel("dd-trace:bundler:load")
          .subscribe(({ package, path, version }) =>
            bundledModules.push({ package, path, version })
          );
        require("node:diagnostics_channel")
          .channel("dd-trace:instrumentation:load")
          .subscribe((payload) => loadedInstrumentations.push(payload));
        let instrumented = false;
        channel.subscribe(() => {
          instrumented = true;
        });

        const app = require(process.argv[2]).default;
        void Promise.resolve(
          app.fetch(new Request("http://localhost/test"), { incoming: {} })
        )
          .then((response) => {
            if (!instrumented) {
              throw new Error(
                \`Bundled Hono did not publish its APM channel: \${JSON.stringify({ bundledModules, loadedInstrumentations })}\`
              );
            }
            if (response.status !== 200) {
              throw new Error(\`Unexpected response status: \${response.status}\`);
            }
            process.stdout.write("instrumented");
          });
      `
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [runnerPath, bundlePath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DD_APPSEC_ENABLED: "false",
          DD_INJECT_FORCE: "true",
          DD_PROFILING_ENABLED: "false",
          DD_REMOTE_CONFIGURATION_ENABLED: "false",
          DD_TELEMETRY_ENABLED: "false",
          DD_TRACE_AGENT_URL: "http://127.0.0.1:9",
          DD_TRACE_STARTUP_LOGS: "false",
        },
        timeout: 10_000,
      }
    );

    expect(stdout).toBe("instrumented");
  });
});
