import { IncomingForm } from "formidable";
import { NextApiRequest, NextApiResponse } from "next";

import { withLogging } from "@app/logger/withlogging";

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

      const file = files.file;

      if (!file) {
        res.status(400).send("No file uploaded.");
        return;
      }

      console.log({ file });

      res.status(200).json({ ok: "oui" });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).send("Error uploading file.");
    }
  } else {
    res.status(405).send("Method Not Allowed");
  }
}

export default withLogging(handler);
