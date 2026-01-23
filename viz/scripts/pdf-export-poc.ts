/**
 * PDF Export PoC Script
 *
 * Usage:
 *   npx tsx scripts/pdf-export-poc.ts <access-token>
 *
 * Or with a full URL:
 *   npx tsx scripts/pdf-export-poc.ts --url "http://localhost:3007/content?accessToken=xxx&identifier=yyy"
 */

import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

const VIZ_URL = process.env.VIZ_URL || "http://localhost:3007";

interface ExportOptions {
  accessToken?: string;
  identifier?: string;
  url?: string;
  outputPath?: string;
  format?: "A4" | "Letter";
  waitForSelector?: string;
  timeoutMs?: number;
}

async function exportFrameToPdf(options: ExportOptions): Promise<Buffer> {
  const {
    accessToken,
    identifier = "pdf-export",
    url,
    format = "A4",
    waitForSelector = '[data-viz-ready="true"]',
    timeoutMs = 30000,
  } = options;

  // Build URL
  let targetUrl: string;
  if (url) {
    // If URL provided, append pdfMode
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set("pdfMode", "true");
    targetUrl = parsedUrl.toString();
  } else if (accessToken) {
    const params = new URLSearchParams({
      accessToken,
      identifier,
      pdfMode: "true",
    });
    targetUrl = `${VIZ_URL}/content?${params.toString()}`;
  } else {
    throw new Error("Either accessToken or url must be provided");
  }

  console.log(`Navigating to: ${targetUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Set a reasonable viewport
    await page.setViewport({ width: 1200, height: 800 });

    // Navigate to the page
    await page.goto(targetUrl, {
      waitUntil: "networkidle0",
      timeout: timeoutMs,
    });

    // Wait for the visualization to be ready
    console.log(`Waiting for selector: ${waitForSelector}`);
    await page.waitForSelector(waitForSelector, { timeout: timeoutMs });

    // Give a bit more time for any animations/charts to settle
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the actual content height
    const contentHeight = await page.evaluate(() => {
      const vizElement = document.querySelector('[data-viz-ready="true"]');
      if (vizElement) {
        const rect = vizElement.getBoundingClientRect();
        return rect.height;
      }
      return document.body.scrollHeight;
    });

    console.log(`Content height: ${contentHeight}px`);

    // Generate PDF
    const pdf = await page.pdf({
      format,
      printBackground: true,
      margin: {
        top: "1cm",
        bottom: "1cm",
        left: "1cm",
        right: "1cm",
      },
      // Scale down to match screen proportions better (1 = 100%, 0.8 = 80%)
      scale: 0.8,
      preferCSSPageSize: false,
      landscape: false,
    });

    console.log(`PDF generated: ${pdf.length} bytes`);
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
PDF Export PoC

Usage:
  npx tsx scripts/pdf-export-poc.ts <access-token>
  npx tsx scripts/pdf-export-poc.ts --url "<full-viz-url>"

Examples:
  npx tsx scripts/pdf-export-poc.ts eyJhbGciOiJIUzI1NiIs...
  npx tsx scripts/pdf-export-poc.ts --url "http://localhost:3007/content?accessToken=xxx&identifier=yyy"

The PDF will be saved to ./output.pdf
    `);
    process.exit(1);
  }

  const options: ExportOptions = {
    outputPath: "./output.pdf",
  };

  if (args[0] === "--url") {
    options.url = args[1];
  } else {
    options.accessToken = args[0];
  }

  try {
    const pdfBuffer = await exportFrameToPdf(options);

    const outputPath = path.resolve(options.outputPath!);
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(`PDF saved to: ${outputPath}`);
  } catch (error) {
    console.error("Export failed:", error);
    process.exit(1);
  }
}

main();
