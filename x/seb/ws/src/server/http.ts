import express, { Request, Response } from "express";
import getRawBody from "raw-body";
import contentType from "content-type";
import {
  channelNames,
  hasSubscribers,
  publishMessage,
  subscribeToChannel,
} from "./queue";
import { randomUUID } from "node:crypto";

const MAXIMUM_MESSAGE_SIZE = "4mb";

export const setupEndpoints = (app: express.Application) => {
  // Log all HTTP requests
  // app.use((req: Request, res: Response, next: () => void) => {
  //   const timestamp = new Date().toISOString();
  //   console.log(`[${timestamp}] ${req.method} ${req.url} ${req.body}`);
  //   next();
  // });

  // HTTP endpoint to stream the events from the channel to the client
  app.get("/:channel/sse", async (req: Request, res: Response) => {
    const channel = req.params.channel || "default";

    const sessionId = randomUUID();
    const endpoint = encodeURI(`/${channel}/sse?sessionId=${sessionId}`);
    const { events, messages } = channelNames(channel);

    // no one is listening to the messages channel, meaning we have no servers connected via websocket
    if (!hasSubscribers(messages)) {
      console.log(
        "Rejecting SSE connection as we have no servers connected",
        messages
      );
      res.writeHead(500).end("No subscribers to channel");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send the endpoint event
    res.write(`event: endpoint\ndata: ${endpoint}\n\n`);

    // Subscribe to Redis events
    const unsubscribe = await subscribeToChannel(events, (message) => {
      res.write(`event: message\ndata: ${message}\n\n`);
    });

    // Clean up subscription when SSE connection closes
    res.on("close", () => {
      unsubscribe();
    });
  });

  // HTTP endpoint to send message to a specific client and wait for response
  app.post(
    "/:channel/sse",
    express.json(),
    async (
      req: Request<{ channel: string; sessionId: string }>,
      res: Response
    ): Promise<void> => {
      // const { sessionId } = req.query;
      const channel = req.params.channel || "default";

      const { events, messages } = channelNames(channel);

      // No one is listening to the events channel, meaning we have no client connected via sse
      if (!hasSubscribers(events)) {
        console.log(
          "Rejecting message has we have no clients connected",
          events
        );
        const message = "SSE connection not established";
        res.writeHead(500).end(message);
        throw new Error(message);
      }

      let body: string | unknown;
      try {
        const ct = contentType.parse(req.headers["content-type"] ?? "");
        if (ct.type !== "application/json") {
          throw new Error(`Unsupported content-type: ${ct}`);
        }

        body =
          req.body ??
          (await getRawBody(req, {
            limit: MAXIMUM_MESSAGE_SIZE,
            encoding: ct.parameters.charset ?? "utf-8",
          }));
      } catch (error) {
        console.error("Error parsing body", error);
        res.writeHead(400).end(String(error));
        return;
      }

      try {
        await publishMessage(
          messages,
          typeof body === "string" ? body : JSON.stringify(body)
        );
      } catch (error) {
        console.error("Error publishing message to Redis", error);
        res.writeHead(400).end(`Invalid message: ${body}`);
        return;
      }

      res.writeHead(202).end("Accepted");
    }
  );
};
