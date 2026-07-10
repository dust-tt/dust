/** @ignoreswagger */
import logger from "@marketing/logger/logger";
import { createReadStream } from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

// Ungated public access to the AI Enterprise Playbook. Serves the same
// canonical PDF used by the gated /landing/ebook flow (single source of truth
// in assets/gated), streamed inline so it renders in the on-page reader.
// `?download=1` switches the disposition to attachment for an explicit
// download.
const EBOOK_FILENAME = "Dust_AI_Enterprise_Playbook.pdf";

// The playbook PDF is ~16MB, above Next's default 4MB API response cap. Disable
// the limit so the file streams in full rather than tripping the warning.
export const config = {
  api: {
    responseLimit: false,
  },
};

// biome-ignore lint/plugin/nextjsPageComponentNaming: API route
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const isDownload = req.query.download === "1";
  const filePath = path.join(process.cwd(), "assets", "gated", EBOOK_FILENAME);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${isDownload ? "attachment" : "inline"}; filename="${EBOOK_FILENAME}"`
  );
  // Immutable asset: allow browsers/CDN to cache it for an hour.
  res.setHeader("Cache-Control", "public, max-age=3600");

  const stream = createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", (err) => {
    logger.error({ err }, "Failed to stream AI Enterprise Playbook PDF");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to load file." });
    }
  });
}
