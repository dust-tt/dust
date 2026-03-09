import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { createHmac } from "crypto";
import { createReadStream } from "fs";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";

const EBOOK_FILENAME = "Dust_Connected_Enterprise_AI_Playbook.pdf";

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

  const { token } = req.query;

  if (typeof token !== "string" || !isValidToken(token)) {
    return res.redirect(302, "/landing/ebook");
  }

  const filePath = path.join(process.cwd(), "assets", "gated", EBOOK_FILENAME);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${EBOOK_FILENAME}"`
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
