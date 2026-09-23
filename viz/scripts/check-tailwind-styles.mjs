import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://localhost:3007";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
  await page.goto(baseUrl);
  const coverage = await (
    await page.request.get(`${baseUrl}/tailwind-coverage.json`)
  ).json();
  assert.ok(coverage.missingClasses.includes("bg-opacity-80"));
  assert.ok(!coverage.missingClasses.includes("bg-black/80"));
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div id="alpha" class="bg-black/80"></div>
      <div id="removed" class="bg-black bg-opacity-80"></div>
      <div class="responsive-text">
        <div id="slide-text" class="text-3xl p-4 gap-4"></div>
        <div class="space-y-4"><div id="space-first">First</div><div id="space-second">Second</div></div>
      </div>
      <div style="position:relative;width:400px"><div id="navigation" class="absolute left-1/2 -translate-x-1/2" style="width:100px"></div></div>
      <div id="linear" class="bg-gradient-to-b from-white to-stone-50"></div>
      <div id="radial" class="bg-gradient-radial from-white to-stone-50"></div>
      <div id="conic" class="bg-gradient-conic from-white to-stone-50"></div>
      <div id="hidden" class="block" hidden></div>
      <div id="hover" class="bg-black hover:bg-blue-500" style="height:20px"></div>
      <div id="responsive" class="hidden md:block"></div>
      <div style="--font-sans:Arial;--font-serif:Georgia;--font-mono:monospace">
        <div id="theme-sans" class="font-sans">Sans</div>
        <div id="theme-serif" class="font-serif">Serif</div>
        <div id="theme-mono" class="font-mono">Mono</div>
      </div>
      <div id="semantic" class="bg-background"></div>
      <div id="dark" class="bg-background dark:bg-stone-800/80"></div>`;
  });
  const observations = await page.evaluate(() => {
    const style = (id) => getComputedStyle(document.getElementById(id));
    const pixel = (id) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      context.fillStyle = style(id).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    return {
      fonts: ["theme-sans", "theme-serif", "theme-mono"].map(
        (id) => style(id).fontFamily,
      ),
      alpha: pixel("alpha"),
      removed: pixel("removed"),
      slide: {
        fontSize: style("slide-text").fontSize,
        padding: style("slide-text").padding,
        gap: style("slide-text").gap,
      },
      space: {
        first: style("space-first").marginBottom,
        second: style("space-second").marginTop,
      },
      navigationLeft: document
        .getElementById("navigation")
        .getBoundingClientRect().left,
      gradients: ["linear", "radial", "conic"].map(
        (id) => style(id).backgroundImage,
      ),
      hiddenDisplay: style("hidden").display,
      responsiveDisplay: style("responsive").display,
      hoverColor: style("hover").backgroundColor,
      lightColor: style("dark").backgroundColor,
      semanticLightColor: style("semantic").backgroundColor,
    };
  });
  assert.deepEqual(observations.fonts, ["Arial", "Georgia", "monospace"]);
  assert.deepEqual(observations.alpha, [0, 0, 0, 204]);
  assert.deepEqual(observations.removed, [0, 0, 0, 255]);
  assert.deepEqual(observations.slide, {
    // Existing slideshow clamp(18px, 3.24vw, 27px) at a 600px viewport.
    fontSize: "19.44px",
    padding: "6px",
    gap: "6px",
  });
  assert.deepEqual(observations.space, { first: "0px", second: "6px" });
  assert.equal(observations.navigationLeft, 150);
  assert.ok(observations.gradients.every((gradient) => gradient !== "none"));
  assert.equal(observations.hiddenDisplay, "none");
  assert.equal(observations.responsiveDisplay, "none");
  await page.locator("#hover").hover();
  assert.notEqual(
    await page
      .locator("#hover")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    observations.hoverColor,
  );
  await page.setViewportSize({ width: 900, height: 800 });
  assert.equal(
    await page
      .locator("#responsive")
      .evaluate((element) => getComputedStyle(element).display),
    "block",
  );
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  assert.notEqual(
    await page
      .locator("#dark")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    observations.lightColor,
  );
  assert.notEqual(
    await page
      .locator("#semantic")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    observations.semanticLightColor,
  );

  // Render real runtime code through Viz's RPC wrapper, including an imported
  // child Frame and a class that appears only after an interaction.
  await page.evaluate(
    ({ baseUrl }) => {
      document.documentElement.classList.remove("dark");
      window.tailwindReports = [];
      window.frameErrors = [];
      const iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.src = `${baseUrl}/content?identifier=tailwind-fixture&fullHeight=true`;
      window.addEventListener("message", (event) => {
        if (event.source !== iframe.contentWindow) return;
        const data = event.data;
        if (data.type === "TAILWIND_MISSING_CLASSES")
          window.tailwindReports.push(data);
        if (data.command === "setErrorMessage")
          window.frameErrors.push(data.params.errorMessage);
        let result;
        if (data.command === "getCodeToExecute") {
          result = {
            code:
              window.themeFixtureCode ??
              `
          import { useState } from "react";
          import Nested from "fil_nested0001";
          export default function Frame() {
            const [expanded, setExpanded] = useState(false);
            return <div className="bg-opacity-80">
              <Nested />
              <button onClick={() => setExpanded(!expanded)}>Toggle</button>
              {expanded && <div className="text-opacity-50">Dynamic content</div>}
            </div>;
          }
        `,
          };
        } else if (data.command === "getFile") {
          result = {
            fileBlob: new Blob(
              [
                'export default function Nested() { return <span className="ring-opacity-50">Nested frame</span>; }',
              ],
              { type: "application/vnd.dust.frame" },
            ),
          };
        } else {
          return;
        }
        event.source.postMessage(
          { messageUniqueId: data.messageUniqueId, result },
          "*",
        );
      });
      document.body.replaceChildren(iframe);
    },
    { baseUrl },
  );
  const frame = page.frameLocator("iframe");
  await frame.getByText("Nested frame").waitFor();
  await page.waitForFunction(() =>
    window.tailwindReports
      .flatMap((report) => report.classNames)
      .includes("ring-opacity-50"),
  );
  await frame.getByRole("button", { name: "Toggle" }).click();
  await page.waitForFunction(() =>
    window.tailwindReports
      .flatMap((report) => report.classNames)
      .includes("text-opacity-50"),
  );
  await frame.getByRole("button", { name: "Toggle" }).click();
  await frame.getByRole("button", { name: "Toggle" }).click();
  // Allow the diagnostic batch timer to run if it incorrectly re-reports a class.
  await page.waitForTimeout(350);
  const diagnostics = await page.evaluate(() => ({
    reports: window.tailwindReports,
    errors: window.frameErrors,
  }));
  assert.deepEqual(diagnostics.errors, []);
  assert.deepEqual(
    diagnostics.reports.flatMap((report) => report.classNames).sort(),
    ["bg-opacity-80", "ring-opacity-50", "text-opacity-50"],
  );
  assert.ok(
    diagnostics.reports.every(
      (report) =>
        report.identifier === "tailwind-fixture" &&
        report.buildId === coverage.buildId,
    ),
  );
  // Saved Frames mix semantic Cards with fixed colors. Only an outer root
  // receiving a theme may change those defaults, including portalled content.
  const themeFixtures = [
    { name: "legacy", root: "<Content />", optedIn: false },
    {
      name: "page",
      root: "<FrameRoot><Content /></FrameRoot>",
      optedIn: false,
    },
    {
      name: "themed-page",
      root: "<FrameRoot theme={{}}><Content /></FrameRoot>",
      optedIn: true,
    },
    {
      name: "slideshow",
      root: "<Slideshow><Slide><Content /></Slide></Slideshow>",
      optedIn: false,
    },
    {
      name: "themed-slideshow",
      root: "<Slideshow theme={{}}><Slide><Content /></Slide></Slideshow>",
      optedIn: true,
    },
    {
      name: "nested-theme",
      root: '<FrameRoot><FrameRoot theme={{ "--primary": "rebeccapurple" }}><Content /></FrameRoot></FrameRoot>',
      optedIn: false,
    },
  ];
  const runtimeFrame = page
    .frames()
    .find((candidate) => candidate.parentFrame() === page.mainFrame());
  assert.ok(runtimeFrame);
  for (const hostTheme of ["light", "dark"]) {
    for (const fixture of themeFixtures) {
      await page.evaluate(
        ({ baseUrl, hostTheme, fixture }) => {
          window.themeFixtureCode = `
          import { FrameRoot } from "@dust/frame";
          import { Slide, Slideshow } from "@dust/slideshow/v2";
          import { Card, Dialog, DialogContent, DialogTitle } from "shadcn";
          function Content() {
            return <>
              <div style={{ colorScheme: "light" }}>
                <Card id="fixed-text-card"><p style={{ color: "#172b20" }}>Authored light card</p></Card>
              </div>
              <Card id="dashboard-card">
                <div style={{ background: "#f9fafb" }}><p id="forecast-value">123K</p></div>
              </Card>
              <div style={{ "--card": "papayawhip", "--card-foreground": "#172b20" }}>
                <Card id="custom-card">Custom colors</Card>
              </div>
              <Dialog open>
                <DialogContent id="portal-card" className="bg-card text-card-foreground">
                  <DialogTitle>Portal</DialogTitle>
                </DialogContent>
              </Dialog>
            </>;
          }
          export default function App() { return ${fixture.root}; }
        `;
          window.frameErrors = [];
          const params = new URLSearchParams({
            identifier: `theme-${fixture.name}`,
            fullHeight: "true",
            theme: hostTheme,
          });
          document.querySelector("iframe").src = `${baseUrl}/content?${params}`;
        },
        { baseUrl, hostTheme, fixture },
      );
      await runtimeFrame.waitForURL(
        (url) =>
          url.searchParams.get("identifier") === `theme-${fixture.name}` &&
          url.searchParams.get("theme") === hostTheme,
      );
      await frame.locator('[data-viz-ready="true"]').waitFor();
      const colors = await frame.locator("#dashboard-card").evaluate((card) => {
        const color = (id, property) =>
          getComputedStyle(document.getElementById(id))[property];
        return {
          isDark: document.documentElement.classList.contains("dark"),
          background: getComputedStyle(card).backgroundColor,
          foreground: getComputedStyle(card).color,
          fixedTextCard: color("fixed-text-card", "backgroundColor"),
          forecast: color("forecast-value", "color"),
          portal: color("portal-card", "backgroundColor"),
          custom: color("custom-card", "backgroundColor"),
        };
      });
      const isDark = fixture.optedIn && hostTheme === "dark";
      assert.equal(colors.isDark, isDark, fixture.name);
      assert.equal(
        colors.background,
        isDark ? "oklch(0.205 0 0)" : "oklch(1 0 0)",
        fixture.name,
      );
      assert.equal(colors.fixedTextCard, colors.background, fixture.name);
      assert.equal(colors.portal, colors.background, fixture.name);
      assert.equal(colors.forecast, colors.foreground, fixture.name);
      assert.equal(
        colors.foreground,
        isDark ? "oklch(0.985 0 0)" : "oklch(0.1898 0.0094 255.633)",
        fixture.name,
      );
      assert.equal(colors.custom, "rgb(255, 239, 213)", fixture.name);
      assert.deepEqual(
        await page.evaluate(() => window.frameErrors),
        [],
        fixture.name,
      );
    }
  }
  process.stdout.write(
    `Passed V4 styles, slideshow/theme/responsive checks, Frame theme opt-in, and rendered Frame diagnostics in Chromium ${browser.version()}.\n`,
  );
} finally {
  await browser.close();
}
