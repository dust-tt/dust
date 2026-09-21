import assert from "node:assert/strict";
import { chromium } from "playwright";

// Run against `npm run start -- --port 3007` after a production build. These
// classes are outside Tailwind's scanned app/components directories, so this
// also checks that runtime Frame content can rely on the frozen safelist.
const baseUrl = process.argv[2] ?? "http://localhost:3007";
const cases = [];
const families = {
  bg: "bg-red-500",
  text: "text-red-500",
  border: "border-2 border-red-500",
  divide: "divide-y divide-red-500",
  placeholder: "placeholder-red-500",
  ring: "ring-2 ring-red-500",
};
for (const [family, color] of Object.entries(families)) {
  for (let opacity = 0; opacity <= 100; opacity += 5) {
    cases.push({
      id: `${family}-${opacity}`,
      family,
      className: `${color} ${family}-opacity-${opacity}`,
      opacity,
    });
  }
  cases.push({
    id: `${family}-control`,
    family,
    className: color,
    opacity: 100,
  });
  cases.push({
    id: `${family}-slash-100`,
    family,
    className: `${color} ${family}-red-500/100 ${family}-opacity-25`,
    opacity: 100,
  });
  cases.push({
    id: `${family}-semantic`,
    family,
    className: `${color.replace(`${family}-red-500`, `${family}-background`)} ${family}-opacity-25`,
    opacity: 100,
    rgb: [255, 255, 255],
  });
  cases.push({
    id: `${family}-slash`,
    family,
    className: `${color} ${family}-red-500/50 ${family}-opacity-25`,
    opacity: 50,
  });
}
cases.push({
  id: "arbitrary",
  family: "bg",
  className: "bg-[#ff0000] bg-opacity-50",
  opacity: 50,
  rgb: [255, 0, 0],
});
cases.push(
  {
    id: "white",
    family: "bg",
    className: "bg-white bg-opacity-50",
    opacity: 50,
    rgb: [255, 255, 255],
  },
  {
    id: "black-ring",
    family: "ring",
    className: "ring-2 ring-black ring-opacity-25",
    opacity: 25,
    rgb: [0, 0, 0],
  },
  {
    id: "custom-stone",
    family: "bg",
    className: "bg-stone-150 bg-opacity-50",
    opacity: 50,
    rgb: [238, 238, 236],
  }
);
const aliases = [
  ["blur-0", "filter", "blur(0px)"],
  ["backdrop-blur-0", "backdropFilter", "blur(0px)"],
  ["columns-2xs", "columnWidth", "288px"],
  ["columns-3xs", "columnWidth", "256px"],
  ["-order-first", "order", "9999"],
  ["-order-last", "order", "-9999"],
  ["-order-none", "order", "0"],
];
const markup = cases
  .map(({ id, family, className }) => {
    if (family === "placeholder") {
      return `<input id="${id}" class="${className}" placeholder="Placeholder">`;
    }
    if (family === "divide") {
      return `<div id="${id}" class="${className}"><div data-target>First</div><div hidden>Hidden</div><div>Last</div></div>`;
    }
    return `<div id="${id}" class="${className}">Frame content</div>`;
  })
  .join("");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(
    (html) => {
      document.body.innerHTML = html;
    },
    `${markup}
    ${aliases.map(([name]) => `<div id="${name}" class="${name}"></div>`).join("")}
    <div class="responsive-text"><div id="slide-text" class="text-3xl p-4 gap-4"></div>
      <div class="space-y-4"><div id="space-first">First</div><div id="space-second">Second</div></div>
    </div>
    <div style="position:relative;width:400px"><div id="navigation" class="absolute left-1/2 -translate-x-1/2" style="width:100px"></div></div>
    <div id="linear" class="bg-gradient-to-b from-white to-stone-50"></div>
    <div id="radial" class="bg-gradient-radial from-white to-stone-50"></div>
    <div id="conic" class="bg-gradient-conic from-white to-stone-50"></div>

    <div id="border-directions" class="border-2 border-red-500 border-x-blue-500 border-opacity-50"></div>
    <div class="bg-red-500 bg-opacity-50"><div id="opacity-child" class="bg-red-500"></div></div>
    <div id="ring-default" class="ring-2"></div>
    <div id="ring-no-color" class="ring-2 ring-opacity-50"></div>
    <div id="max-width" class="max-w-lg"></div>
    <div id="columns" class="columns-lg"></div>
    <div id="rounded" class="rounded-md"></div>
    <div id="hidden" class="block" hidden></div>
    <div id="hover" class="bg-red-500 bg-opacity-25 hover:bg-blue-500" style="height:20px"></div>
    <div id="responsive" class="hidden md:block"></div>
    <div id="dark" class="bg-background dark:bg-stone-800/80"></div>`
  );
  const observations = await page.evaluate(
    ({ cases, aliases }) => {
      const properties = {
        bg: "backgroundColor",
        text: "color",
        border: "borderRightColor",
        divide: "borderBottomColor",
        placeholder: "color",
      };
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      const pixel = (color) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data);
      };
      const colors = Object.fromEntries(
        cases.map(({ id, family, opacity, rgb = [239, 68, 68] }) => {
          const element = document.getElementById(id);
          const target =
            family === "divide"
              ? element.querySelector("[data-target]")
              : element;
          // Resolve the ring custom property as a rendered color, independent of
          // whether the compiler serializes it as hex, rgb(), or a variable.
          if (family === "ring") target.style.color = "var(--tw-ring-color)";
          const style = getComputedStyle(
            target,
            family === "placeholder" ? "::placeholder" : null
          );
          const color =
            family === "ring" ? style.color : style[properties[family]];
          return [
            id,
            {
              color,
              pixel: pixel(color),
              expectedPixel: pixel(`rgba(${rgb.join(",")}, ${opacity / 100})`),
              borderWidth: family === "divide" ? style.borderBottomWidth : null,
            },
          ];
        })
      );
      const style = (id) => getComputedStyle(document.getElementById(id));
      return {
        colors,
        aliases: Object.fromEntries(
          aliases.map(([name, property]) => [name, style(name)[property]])
        ),
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
          (id) => style(id).backgroundImage
        ),

        borders: [
          style("border-directions").borderTopColor,
          style("border-directions").borderRightColor,
        ],
        childBackground: style("opacity-child").backgroundColor,
        ringDefault: style("ring-default").boxShadow,
        ringNoColor: style("ring-no-color").boxShadow,
        maxWidth: style("max-width").maxWidth,
        columns: style("columns").columnWidth,
        radius: style("rounded").borderRadius,
        hiddenDisplay: style("hidden").display,
        responsiveDisplay: style("responsive").display,
      };
    },
    { cases, aliases }
  );
  for (const fixture of cases) {
    const { pixel, expectedPixel, color } = observations.colors[fixture.id];
    // V4 may serialize identical colors as rgb(), oklab(), or color(srgb).
    // Allow one 8-bit rounding step after conversion and alpha premultiplication.
    assert.ok(
      pixel.every(
        (channel, index) => Math.abs(channel - expectedPixel[index]) <= 1
      ),
      `${fixture.id}: ${color} rendered as ${pixel}, expected ${expectedPixel}`
    );
    if (fixture.family === "divide") {
      assert.equal(
        observations.colors[fixture.id].borderWidth,
        "1px",
        `${fixture.id} must color a visible divider`
      );
    }
  }
  for (const [name, , expected] of aliases)
    assert.equal(observations.aliases[name], expected, name);
  assert.deepEqual(observations.slide, {
    fontSize: "18px",
    padding: "6px",
    gap: "6px",
  });
  assert.deepEqual(observations.space, { first: "0px", second: "6px" });
  assert.equal(observations.navigationLeft, 150);
  assert.ok(observations.gradients.every((gradient) => gradient !== "none"));

  assert.deepEqual(observations.borders, [
    "rgba(239, 68, 68, 0.5)",
    "rgba(59, 130, 246, 0.5)",
  ]);
  assert.equal(observations.childBackground, "rgb(239, 68, 68)");
  assert.equal(observations.ringNoColor, observations.ringDefault);
  assert.equal(observations.maxWidth, "512px");
  assert.equal(observations.columns, "512px");
  assert.equal(observations.radius, "7.2px");
  assert.equal(observations.hiddenDisplay, "block");
  assert.equal(observations.responsiveDisplay, "none");
  await page.locator("#hover").hover();
  assert.equal(
    await page
      .locator("#hover")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(59, 130, 246)"
  );
  await page.setViewportSize({ width: 900, height: 800 });
  assert.equal(
    await page
      .locator("#responsive")
      .evaluate((element) => getComputedStyle(element).display),
    "block"
  );
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const darkPixel = await page.locator("#dark").evaluate((element) => {
    // Color-mix may serialize as oklab(). Compare the rendered sRGB pixel.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
  assert.deepEqual(darkPixel, [41, 37, 36, 204]);
  process.stdout.write(
    `Passed ${cases.length} opacity/color cases, ${aliases.length} aliases, and slideshow/theme/responsive checks in Chromium ${browser.version()}.\n`
  );
} finally {
  await browser.close();
}
