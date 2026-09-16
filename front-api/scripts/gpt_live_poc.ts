import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isHiddenMessage } from "@app/components/assistant/conversation/types";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { LiveEventSchema } from "@app/types/assistant/live";
import { isDevelopment } from "@app/types/shared/env";
import { workspaceApp } from "@front-api/middlewares/ctx";
import messageEvents from "@front-api/routes/sse/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events";
import agents from "@front-api/routes/w/[wId]/assistant/agent_configurations";
import live from "@front-api/routes/w/[wId]/assistant/conversations/[cId]/live";
import messages from "@front-api/routes/w/[wId]/assistant/conversations/[cId]/messages";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { chromium } from "playwright";

/**
 * @cc [owner:aubin-tchoi,label:security] live-poc-auth-fixture
 * This explicit development-only smoke test MUST keep its authentication fixture
 * inside this script's request interception and loopback streaming server.
 * Production authentication MUST remain unchanged; voice, message submission,
 * streaming, and result polling use the actual route handlers.
 */
makeScript(
  {
    workspaceId: { type: "string", default: "DevWkSpace" },
    userEmail: { type: "string", demandOption: true },
    audioFile: { type: "string", demandOption: true },
    spaUrl: { type: "string", default: "http://localhost:16011" },
    outputDir: { type: "string", default: "/tmp/gpt-live-e2e" },
  },
  async (
    { workspaceId, userEmail, audioFile, spaUrl, outputDir, execute },
    logger
  ) => {
    if (!isDevelopment()) {
      throw new Error("This POC test must run in development.");
    }
    if (!execute) {
      logger.info(
        {},
        "Would run a real, billable GPT-Live and Dust tool conversation with local fixture authentication."
      );
      return;
    }
    const user = await UserResource.fetchByEmail(userEmail);
    if (!user) {
      throw new Error("Local test user not found.");
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspaceId
    );
    if (!auth.isAdmin()) {
      throw new Error("Use a local workspace admin.");
    }
    const owner = auth.getNonNullableWorkspace();
    const conversation = await createConversation(auth, {
      title: "GPT-Live POC: browser to real Dust tools",
      visibility: "unlisted",
      spaceId: null,
    });
    const app = workspaceApp();
    app.use("*", cors({ origin: spaUrl, credentials: true }));
    app.use("*", async (ctx, next) => {
      ctx.set("auth", auth);
      await next();
    });
    const base = `/api/w/${workspaceId}/assistant`;
    app.route(`${base}/conversations/:cId/live`, live);
    app.route(`${base}/conversations/:cId/messages`, messages);
    app.route(`${base}/agent_configurations`, agents);
    app.route(
      `/api/sse/w/${workspaceId}/assistant/conversations/:cId/messages/:mId/events`,
      messageEvents
    );
    const fixtureServer = serve({
      fetch: app.fetch,
      hostname: "127.0.0.1",
      port: 0,
    });
    await once(fixtureServer, "listening");
    const address = fixtureServer.address();
    if (!address || typeof address === "string") {
      fixtureServer.close();
      throw new Error("Local streaming fixture did not start.");
    }
    const fixtureBase = `http://127.0.0.1:${address.port}`;
    const audio = Array.from(await readFile(audioFile));
    const browser = await chromium.launch({
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.context().grantPermissions(["local-network-access"], {
      origin: spaUrl,
    });
    const events: unknown[] = [];
    const toolResults: unknown[] = [];
    let spokenResult = "";
    let closed = false;
    let toolSucceeded = false;
    let hiddenVoiceContext = false;
    let streamedToolProgress = false;
    const voiceUpdates: unknown[] = [];
    page.on("pageerror", (error) =>
      logger.error({ error: error.message }, "Browser error")
    );
    page.on("requestfailed", (request) => {
      // Closing or reconnecting an SSE stream intentionally aborts its request.
      if (request.failure()?.errorText === "net::ERR_ABORTED") {
        return;
      }
      logger.error(
        { url: request.url(), error: request.failure()?.errorText },
        "Browser request failed"
      );
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        logger.error({ message: message.text() }, "Browser console error");
      }
      if (message.text().startsWith("LIVE_APPEND ")) {
        const update: { type: string; content: string } = JSON.parse(
          message.text().slice("LIVE_APPEND ".length)
        );
        voiceUpdates.push(update);
        if (
          update.type === "session.thinking.append" &&
          update.content.startsWith("Tool ")
        ) {
          streamedToolProgress = true;
        }
        logger.info({ update }, "Voice received streamed update");
        return;
      }
      if (!message.text().startsWith("LIVE_EVENT ")) {
        return;
      }
      const parsed = LiveEventSchema.safeParse(
        JSON.parse(message.text().slice(11))
      );
      if (!parsed.success) {
        return;
      }
      const event = parsed.data;
      events.push(event);
      logger.info({ event }, "Live event");
      if (event.type === "session.output_transcript.delta") {
        spokenResult += event.delta;
      }
      if (event.type === "session.closed") {
        closed = true;
      }
    });
    await page.route(`${spaUrl}/live-fixture`, (route) =>
      route.fulfill({
        json: { owner, user: user.toJSON(), conversationId: conversation.sId },
      })
    );
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith("/api/")) {
        await route.fallback();
        return;
      }
      if (url.pathname.startsWith("/api/sse/")) {
        // Continue the browser request to a loopback server: fulfill() would buffer
        // the SSE response and defeat the streaming behavior this test exercises.
        await route.continue({
          url: `${fixtureBase}${url.pathname}${url.search}`,
        });
        return;
      }
      const response = await app.request(url.pathname + url.search, {
        method: request.method(),
        headers: request.headers(),
        body: request.postData() ?? undefined,
      });
      const body = await response.text();
      if (
        url.pathname.endsWith("/messages") &&
        request.method() === "POST" &&
        response.ok
      ) {
        const posted = JSON.parse(body);
        hiddenVoiceContext =
          posted.message.context.origin === "voice" &&
          isHiddenMessage({
            ...posted.message,
            contentFragments: posted.contentFragments,
          });
      }
      logger.info(
        {
          method: request.method(),
          path: url.pathname,
          responseStatus: response.status,
        },
        "Fixture route"
      );
      if (url.pathname.includes("/messages/") && response.ok) {
        const message = JSON.parse(body).message;
        if (isAgentMessageType(message) && message.status === "succeeded") {
          toolResults.push(message);
          logger.info(
            {
              content: message.content,
              tools: message.actions.map((action) => ({
                name: action.functionCallName,
                actionStatus: action.status,
              })),
            },
            "Dust result"
          );
          toolSucceeded = message.actions.some(
            (action) =>
              action.functionCallName.endsWith("math_operation") &&
              action.status === "succeeded"
          );
        }
      }
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body,
      });
    });
    await page.route(`${spaUrl}/`, async (route) => {
      const response = await route.fetch();
      const fixturePath = path.resolve(
        "../front/scripts/gpt_live_poc/browser.tsx"
      );
      const body = (await response.text()).replace(
        /src="\/src\/app\/main\.tsx[^\"]*"/,
        `src="/@fs/${fixturePath}"`
      );
      await route.fulfill({ response, body });
    });
    // Replace only the microphone source with deterministic speech. The native
    // RTCPeerConnection, media transport, server negotiation, and hook stay real.
    await page.addInitScript((wav) => {
      let context: AudioContext;
      let output: MediaStreamAudioDestinationNode;
      navigator.mediaDevices.getUserMedia = async () => {
        context = new AudioContext();
        await context.resume();
        output = context.createMediaStreamDestination();
        const oscillator = context.createOscillator();
        const silence = context.createGain();
        silence.gain.value = 0;
        oscillator.connect(silence).connect(output);
        oscillator.start();
        return output.stream;
      };
      const original = RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel = function (
        label,
        options
      ) {
        this.addEventListener("track", ({ track }) => {
          const recorder = new MediaRecorder(new MediaStream([track]));
          let bytes = 0;
          recorder.ondataavailable = ({ data }) => {
            bytes += data.size;
            document.documentElement.dataset.liveAudioBytes = String(bytes);
          };
          recorder.start(500);
        });
        const channel = original.call(this, label, options);
        const send = channel.send;
        channel.send = function (data) {
          if (typeof data === "string") {
            console.log(`LIVE_APPEND ${data}`);
          }
          Reflect.apply(send, this, [data]);
        };
        channel.addEventListener("message", async ({ data }) => {
          console.log(`LIVE_EVENT ${data}`);
          if (JSON.parse(data).type === "session.started") {
            const buffer = await context.decodeAudioData(
              Uint8Array.from(wav).buffer
            );
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(output);
            source.start(context.currentTime + 0.5);
          }
        });
        return channel;
      };
    }, audio);
    try {
      await page.goto(spaUrl, { waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: "Start voice", exact: true })
        .click({ timeout: 60_000 });
      await page
        .getByText("Listening", { exact: true })
        .waitFor({ timeout: 60_000 });
      const deadline = Date.now() + 120_000;
      while (
        Date.now() < deadline &&
        !(
          toolSucceeded &&
          /391|three (hundred (and )?)?ninety.one/i.test(spokenResult)
        )
      ) {
        await page.waitForTimeout(500);
      }
      if (
        !toolSucceeded ||
        !/391|three (hundred (and )?)?ninety.one/i.test(spokenResult)
      ) {
        throw new Error("Expected a successful math_operation and spoken 391.");
      }
      if (!hiddenVoiceContext || !streamedToolProgress) {
        throw new Error(
          "Expected hidden voice context and live tool progress through the real SSE stream."
        );
      }
      await page.getByRole("button", { name: "Mute", exact: true }).click();
      await page.getByText("Microphone muted", { exact: true }).waitFor();
      await page.screenshot({ path: `${outputDir}.png`, timeout: 10_000 });
      await page.getByRole("button", { name: "End call", exact: true }).click();
      await page
        .getByRole("button", { name: "Start voice", exact: true })
        .waitFor({ timeout: 15_000 });
      const audioBytes = await page.evaluate(() =>
        Number(document.documentElement.dataset.liveAudioBytes)
      );
      if (!closed || audioBytes < 1000) {
        throw new Error("Missing confirmed session close or received audio.");
      }
      logger.info(
        { conversationId: conversation.sId, audioBytes, spokenResult },
        "GPT-Live end-to-end passed"
      );
    } finally {
      await writeFile(
        `${outputDir}.json`,
        JSON.stringify(
          {
            conversationId: conversation.sId,
            events,
            toolResults,
            voiceUpdates,
            hiddenVoiceContext,
            streamedToolProgress,
          },
          null,
          2
        )
      );
      try {
        await page.screenshot({
          path: `${outputDir}-final.png`,
          timeout: 10_000,
        });
      } finally {
        await browser.close();
        fixtureServer.close();
      }
    }
  }
);
