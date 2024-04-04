import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { uploadToBucket } from "@app/lib/dfs";
import { withLogging } from "@app/logger/withlogging";

const { DUST_UPLOAD_BUCKET = "" } = process.env;

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method === "POST") {
    try {
      const form = new IncomingForm({
        filter: ({ mimetype }) => {
          if (!mimetype) {
            return false;
          }

          // Only allow uploading image.
          return mimetype.includes("image");
        },
        maxFileSize: 3 * 1024 * 1024, // 3 mb.
      });

      const [, files] = await form.parse(req);

      const { file: maybeFiles } = files;

      if (!maybeFiles) {
        res.status(400).send("No file uploaded.");
        return;
      }

      const [file] = maybeFiles;

      await uploadToBucket("PUBLIC_UPLOAD", file);

      const fileUrl = `https://storage.googleapis.com/${DUST_UPLOAD_BUCKET}/${file.newFilename}`;

      res.status(200).json({ fileUrl });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).send("Error uploading file.");
    }
  } else {
    res.status(405).send("Method Not Allowed");
  }
}

export default withLogging(handler);
