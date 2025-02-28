import express from "express";
import { createServer } from "http";
import { setupEndpoints } from "./http";
import { setupWebSocketServer } from "./ws";

const app = express();
const server = createServer(app);

setupEndpoints(app);
setupWebSocketServer(server);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
