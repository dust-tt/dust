const { chromium } = require("playwright");
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const root = path.resolve(__dirname, "../../..");
const state = path.join(
  os.homedir(),
  ".dust-hive",
  "envs",
  path.basename(root),
);
const ports = JSON.parse(fs.readFileSync(path.join(state, "ports.json")));
const fixture = spawn(
  "python3",
  [
    "-u",
    "-c",
    "from test_proxy import Fixture, ThreadingHTTPServer; s = ThreadingHTTPServer(('127.0.0.1', 0), Fixture); print(s.server_port, flush=True); s.serve_forever()",
  ],
  { cwd: __dirname },
);

function profile(name, overrides = {}) {
  const result = spawnSync(
    "env",
    [
      ...Object.entries(overrides).map(([key, value]) => `${key}=${value}`),
      "python3",
      path.join(__dirname, "hive.py"),
      "start",
      name,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}

(async () => {
  const fixturePort = await new Promise((resolve, reject) => {
    fixture.stdout.once("data", (data) =>
      resolve(Number(data.toString().trim())),
    );
    fixture.once("error", reject);
    fixture.once("exit", (code) =>
      reject(new Error(`Fixture exited: ${code}`)),
    );
  });
  const browser = process.argv.includes("--headless")
    ? await chromium.launch({
        channel: "chrome",
        headless: true,
        proxy: {
          server: `http://127.0.0.1:${ports.base + 80}`,
          bypass: "<-loopback>",
        },
        args: ["--disable-quic"],
      })
    : await chromium.connectOverCDP(
        `http://127.0.0.1:${ports.base + 81}`,
      );
  const context = browser.contexts()[0] ?? (await browser.newContext());
  let page;
  try {
    for (const name of ["pass", "full", "chunk", "latency", "deny"]) {
      profile(name);
      page = await context.newPage();
      await page.goto("http://localhost:3011/@vite/client");
      const result = await page.evaluate(
        async ({ root, fixturePort, name }) => {
          const modulePath = `/@fs${root}/front/lib/client/event_source_manager.ts`;
          const source = await (await fetch(modulePath)).text();
          const polyfillPath = source.match(
            /from "([^\"]*event-source-polyfill[^\"]*)"/,
          )[1];
          const [
            { EventSourceManager },
            { ManagedEventSourceTransport },
            polyfill,
          ] = await Promise.all([
            import(modulePath),
            import(`/@fs${root}/front/lib/client/event_source_transport.ts`),
            import(polyfillPath),
          ]);
          const { EventSourcePolyfill } = polyfill.default;
          const base = `http://127.0.0.1:${fixturePort}`;
          const startedMs = performance.now();
          const states = [];
          const events = [];
          let sseAttempts = 0;
          let pollRequests = 0;
          const manager = new EventSourceManager(
            async (url) => {
              sseAttempts++;
              return new EventSourcePolyfill(url, {
                Transport: ManagedEventSourceTransport,
                heartbeatTimeout: 300_000,
              });
            },
            () => 0,
            {
              longPollFactory: async (url, { signal }) => {
                pollRequests++;
                return (await (await fetch(url, { signal })).json()).events;
              },
            },
          );
          const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    JSON.stringify({
                      name,
                      states,
                      events,
                      sseAttempts,
                      pollRequests,
                    }),
                  ),
                ),
              18_000,
            );
            manager.subscribe({
              streamId: `netskope-${name}`,
              config: {
                buildURL: () => `${base}/browser`,
                buildLongPollURL: () => `${base}/poll`,
                isTerminalEvent: (event) => JSON.parse(event) === "done",
                replayBufferedEventsOnSubscribe: false,
                restartKey: name,
                workspaceId: "netskope-test",
              },
              subscriber: {
                onEvent: (event) => events.push(event),
                onStateChange: (state) => {
                  states.push({
                    kind: state.kind,
                    ms: Math.round(performance.now() - startedMs),
                  });
                  if (state.kind === "terminal") {
                    clearTimeout(timeout);
                    resolve({
                      name,
                      states,
                      events,
                      sseAttempts,
                      pollRequests,
                    });
                  }
                },
              },
              keepAliveWithoutSubscribers: false,
            });
          });
          return result;
        },
        { root, fixturePort, name },
      );
      process.stdout.write(JSON.stringify(result) + "\n");
      if (
        name === "pass" ? result.pollRequests !== 0 : result.pollRequests === 0
      ) {
        throw new Error(`Unexpected fallback result for ${name}`);
      }
      if (!result.events.includes('"done"'))
        throw new Error(`Lost terminal event for ${name}`);
      await page.close();
    }
  } finally {
    profile("full");
    await page?.close();
    await browser.close();
  }
})()
  .catch((error) => {
    process.stderr.write(String(error.stack || error) + "\n");
    process.exitCode = 1;
  })
  .finally(() => fixture.kill());
