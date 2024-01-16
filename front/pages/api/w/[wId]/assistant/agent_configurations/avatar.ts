import { Storage } from "@google-cloud/storage";
import { IncomingForm } from "formidable";
import fs from "fs";
import type { NextApiRequest, NextApiResponse } from "next";

import { withLogging } from "@app/logger/withlogging";

const { DUST_UPLOAD_BUCKET = "", SERVICE_ACCOUNT } = process.env;

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
      const form = new IncomingForm();
      const [_fields, files] = await form.parse(req);
      void _fields;

      const maybeFiles = files.file;

      if (!maybeFiles) {
        res.status(400).send("No file uploaded.");
        return;
      }

      const file = maybeFiles[0];

      const storage = new Storage({
        keyFilename: SERVICE_ACCOUNT,
      });

      const bucket = storage.bucket(DUST_UPLOAD_BUCKET);
      const gcsFile = await bucket.file(file.newFilename);
      const fileStream = fs.createReadStream(file.filepath);

      await new Promise((resolve, reject) =>
        fileStream
          .pipe(
            gcsFile.createWriteStream({
              metadata: {
                contentType: file.mimetype,
              },
            })
          )
          .on("error", reject)
          .on("finish", resolve)
      );

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
