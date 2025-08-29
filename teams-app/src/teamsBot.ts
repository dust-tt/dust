import { Application } from "@microsoft/teams-ai";
import { MemoryStorage } from "botbuilder";
import { ApplicationTurnState } from "./internal/interface";

// Define storage and application
const storage = new MemoryStorage();
export const app = new Application<ApplicationTurnState>({
  storage,
});
