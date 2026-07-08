/** @ignoreswagger */
import config from "@marketing/lib/api/config";
import logger from "@marketing/logger/logger";
import { createHmac } from "crypto";
import { createReadStream } from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

// Maps the `ebook` query param to the gated PDF filename. Defaults to the AI
// Enterprise Playbook when the param is absent (backward compatible with the
// original /landing/ebook form which sends no `ebook` param).
const EBOOK_FILENAMES: Record<string, string> = {
  "ai-enterprise-playbook": "Dust_AI_Enterprise_Playbook.pdf",
  "ai-first-gtm-playbook": "Dust_AI_First_GTM_Playbook.pdf",
};

const DEFAULT_EBOOK_KEY = "ai-enterprise-playbook";

function isValidToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [expiresStr, signature] = parts;
  const expiresMs = Number(expiresStr);

  if (Number.isNaN(expiresMs) || expiresMs < Date.now()) {
    return false;
  }

  const secret = config.getGatedAssetsTokenSecret();
  const expectedSignature = createHmac("sha256", secret)
    .update(String(expiresMs))
    .digest("hex");

  return signature === expectedSignature;
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: API route
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, ebook } = req.query;

  if (typeof token !== "string" || !isValidToken(token)) {
    return res.redirect(302, "/landing/ebook");
  }

  const ebookKey =
    typeof ebook === "string" && ebook in EBOOK_FILENAMES
      ? ebook
      : DEFAULT_EBOOK_KEY;
  const ebookFilename = EBOOK_FILENAMES[ebookKey];

  const filePath = path.join(process.cwd(), "assets", "gated", ebookFilename);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${ebookFilename}"`
  );

  const stream = createReadStream(filePath);
  stream.pipe(res);
  stream.on("error", (err) => {
    logger.error({ err }, "Failed to stream ebook PDF");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download file." });
    }
  });
}
