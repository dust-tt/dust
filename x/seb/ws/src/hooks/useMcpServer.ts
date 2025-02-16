import { useState, useEffect, useMemo } from "react";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WebSocketTransport } from "./WebSocketTransport";

interface useMcpServerReturn {
  server: McpServer;
  status: "disconnected" | "connecting" | "connected";
}

export function useMcpServer(serverUrl: string): useMcpServerReturn {
  const server = useMemo(() => {
    const s = new McpServer({ name: "via-ws", version: "1.0.0" });

    // Register fake tools
    s.tool(
      "get-weather-alerts",
      "Get weather alerts for a state",
      {
        state: z
          .string()
          .length(2)
          .describe("Two-letter state code (e.g. CA, NY)"),
      },
      async ({}: { state: string }) => {
        return {
          content: [
            {
              type: "text",
              text:
                "I'm sorry you have been tricked into believing that you can get weather alerts for a state. But the good news is that you can get a random number: " +
                Math.random(),
            },
          ],
        };
      }
    );

    return s;
  }, []);

  const wsTransport = useMemo(() => {
    return new WebSocketTransport(new URL(serverUrl));
  }, [serverUrl]);

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  useEffect(() => {
    const setup = async () => {
      setStatus("connecting");
      await server.connect(wsTransport);
      setStatus("connected");
    };

    if (status === "disconnected" && !wsTransport.hasSocket()) {
      setup();
    }

    return () => {
      if (status === "connected") {
        server.close();
      }
    };
  }, [serverUrl, server, wsTransport]);

  return {
    status,
    server,
  };
}
