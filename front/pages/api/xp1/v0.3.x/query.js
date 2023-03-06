import { XP1Run, XP1User } from "../../../../lib/models";

const {
  XP1_DUST_USER,
  XP1_DUST_APP_ID,
  XP1_DUST_API_KEY,
  XP1_DUST_SPECIFICATION_HASH,
} = process.env;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  if (
    !req.body ||
    !(typeof req.body.secret === "string") ||
    !(typeof req.body.input === "object" && req.body.input !== null)
  ) {
    return res.status(400).json({
      error: {
        type: "invalid_request_error",
        message:
          "Invalid request body, `secret` (string) and `input` (object) are required.",
      },
    });
  }

  let user = await XP1User.findOne({
    where: {
      secret: req.body.secret || "none",
    },
  });

  if (!user) {
    return res.status(404).json({
      error: {
        code: "user_not_found",
        message: "User not found",
      },
    });
  }

  const runRes = await fetch(
    `https://dust.tt/api/v1/apps/${XP1_DUST_USER}/${XP1_DUST_APP_ID}/runs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XP1_DUST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        specification_hash: XP1_DUST_SPECIFICATION_HASH,
        config: {
          MODEL: {
            provider_id: "openai",
            model_id: "gpt-3.5-turbo",
            use_cache: false,
            use_stream: true,
          },
        },
        stream: true,
        inputs: [req.body.input],
      }),
    }
  );

  if (!runRes.ok) {
    const error = await runRes.json();
    return res.status(400).json({
      error: {
        type: "query_error",
        message: "There was an error running the query.",
        run_error: error.error,
      },
    });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let buffers = [];

  try {
    for await (const chunk of runRes.body) {
      buffers.push(chunk);
      // console.log("CHUNK", chunk);
      try {
        res.write(chunk);
        res.flush();
      } catch (err) {
        console.log("ERROR streaming to client", err);
      }
    }
  } catch (err) {
    console.log("ERROR streaming from Dust API", err);
  }
  res.end();

  console.log("Retrieved streamed buffers", buffers.length);

  let buf = Buffer.concat(buffers);
  let events = buf
    .toString("utf8")
    .split("\n\n")
    .map((e) => {
      if (e.length === 0 || !e.startsWith("data:")) {
        return null;
      }
      try {
        return JSON.parse(e.split("data:")[1]);
      } catch (err) {
        console.log("ERROR parsing event", err, e);
        return null;
      }
    });

  let modelEvents = events
    .filter(
      (e) =>
        e &&
        e.type === "block_execution" &&
        e.content &&
        e.content.block_type === "llm"
    )
    .map((e) => e.content.execution);

  let runStatusEvents = events.filter(
    (e) => e && e.type === "run_status" && e.content
  );

  let promptTokens = 0;
  let completionTokens = 0;
  modelEvents.forEach((e) => {
    e.forEach((e) => {
      e.forEach((e) => {
        if (!e.error && e.value) {
          promptTokens += e.value.prompt.tokens.length;
          completionTokens += e.value.completion.tokens.length;
        }
      });
    });
  });

  let runStatus = runStatusEvents[runStatusEvents.length - 1].content.status;
  let dustRunId = runStatusEvents[runStatusEvents.length - 1].content.run_id;

  await XP1Run.create({
    userId: user.id,
    dustUser: XP1_DUST_USER,
    dustAppId: XP1_DUST_APP_ID,
    dustRunId: dustRunId,
    runStatus: runStatus,
    promptTokens: promptTokens,
    completionTokens: completionTokens,
  });

  console.log("Run created", {
    promptTokens: promptTokens,
    completionTokens: completionTokens,
    run_status: runStatus,
    run_id: dustRunId,
  });
}
