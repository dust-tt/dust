import { WebSocket, WebSocketServer } from "ws";
import * as http from "http";
import {
  publishMessage,
  subscribeToChannel,
  initializeQueue,
  channelNames,
} from "./queue";

export const setupWebSocketServer = async (server: http.Server) => {
  // Initialize the Redis queue
  await initializeQueue();

  const wss = new WebSocketServer({ server });

  // Generate unique server IDs
  let serverIdCounter = 0;

  wss.on("connection", async (ws, req) => {
    const serverId = `server-${serverIdCounter++}`;
    const channel =
      new URLSearchParams(req.url?.split("?")[1] || "").get("channel") ||
      "default";

    const { messages, events } = channelNames(channel);

    console.log(`Server connected: ${serverId} for channel: ${channel}`);

    // Subscribe to Redis messages for this server
    const unsubscribe = await subscribeToChannel(messages, (message) => {
      //console.log("Received message from Redis", message);
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // sending message to server in channel ${messages}
          ws.send(message);
        }
      } catch (error) {
        console.error(`Error sending message to server ${serverId}:`, error);
      }
    });

    ws.on("message", async (message) => {
      //   console.log(
      //     `Received message from ${serverId}: ${message}, publishing to ${events}`
      //   );
      await publishMessage(events, message.toString());
    });

    ws.on("close", async () => {
      unsubscribe();
      console.log(`Server disconnected: ${serverId}`);
    });
  });
};
