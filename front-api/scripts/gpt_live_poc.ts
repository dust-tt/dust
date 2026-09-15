import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { LiveEventSchema } from "@app/types/assistant/live";
import { isDevelopment } from "@app/types/shared/env";
import { workspaceApp } from "@front-api/middlewares/ctx";
import agents from "@front-api/routes/w/[wId]/assistant/agent_configurations";
import live from "@front-api/routes/w/[wId]/assistant/conversations/[cId]/live";
import messages from "@front-api/routes/w/[wId]/assistant/conversations/[cId]/messages";
import { chromium } from "playwright";

/**
 * @cc [owner:aubin-tchoi,label:security] live-poc-auth-fixture
 * This explicit development-only smoke test MUST keep its authentication fixture
 * inside Playwright request interception. Production authentication is unchanged;
 * voice, message submission, and result polling use the actual route handlers.
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
    app.use("*", async (ctx, next) => {
      ctx.set("auth", auth);
      await next();
    });
    const base = `/api/w/${workspaceId}/assistant`;
    app.route(`${base}/conversations/:cId/live`, live);
    app.route(`${base}/conversations/:cId/messages`, messages);
    app.route(`${base}/agent_configurations`, agents);
    const audio = Array.from(await readFile(audioFile));
    const browser = await chromium.launch({
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const events: unknown[] = [];
    const toolResults: unknown[] = [];
    let spokenResult = "";
    let closed = false;
    let toolSucceeded = false;
    page.on("pageerror", (error) =>
      logger.error({ error: error.message }, "Browser error")
    );
    page.on("console", (message) => {
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
      const response = await app.request(url.pathname + url.search, {
        method: request.method(),
        headers: request.headers(),
        body: request.postData() ?? undefined,
      });
      const body = await response.text();
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
          { conversationId: conversation.sId, events, toolResults },
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
      }
    }
  }
);
