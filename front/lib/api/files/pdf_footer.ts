import logger from "@app/logger/logger";
import fs from "fs";
import path from "path";

// Resolved relative to this file so the lookup works regardless of the
// process' cwd (front/, front-api/, tests, …).
const LOGO_PATH = path.resolve(
  __dirname,
  "../../../public/static/landing/logos/dust/Dust_LogoSquare.svg"
);

// Read logo SVG once at module load time (not per request).
// Falls back to empty string if file is missing - footer still works, just no logo.
function loadLogoSvg(): string {
  try {
    return fs
      .readFileSync(LOGO_PATH, "utf-8")
      .replace(/width="48" height="48"/, 'width="16" height="16"');
  } catch (err) {
    logger.error({ err, path: LOGO_PATH }, "Failed to load PDF footer logo!");
    return "";
  }
}

const logoSvg = loadLogoSvg();

export const PDF_FOOTER_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10px;
      color: #6B7280;
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      -webkit-print-color-adjust: exact;
    }
    .footer-content {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  </style>
</head>
<body>
  <div class="footer-content">
    ${logoSvg}
    <span>Created with Dust</span>
  </div>
</body>
</html>`;
