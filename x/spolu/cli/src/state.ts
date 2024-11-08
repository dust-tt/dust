import type {
  ConversationWithoutContentType,
  DustAPICredentials,
  LightAgentConfigurationType,
} from "@dust-tt/types";
import { DustAPI } from "@dust-tt/types";
import fs from "fs/promises";
import path from "path";

export class State {
  agents: LightAgentConfigurationType[] = [];
  private conversations: ConversationWithoutContentType[] = [];

  private credentials: DustAPICredentials | null = null;
  private url: string = "https://dust.tt";
  private _dustAPI: DustAPI | null = null;

  private configPath: string = path.join(
    process.env.HOME || ".",
    ".config",
    "dust"
  );
  private agentsPath: string = path.join(this.configPath, "agents.json");
  private conversationsPath: string = path.join(
    this.configPath,
    "conversations.json"
  );

  dustAPI(): DustAPI {
    if (!this.credentials) {
      throw new Error("credentials not set");
    }
    if (!this._dustAPI) {
      this._dustAPI = new DustAPI(
        {
          url: this.url,
          nodeEnv: "production",
        },
        this.credentials,
        console,
        { useLocalInDev: false }
      );
    }
    return this._dustAPI;
  }

  async refreshAgentList() {
    const res = await this.dustAPI().getAgentConfigurations();
    if (res.isErr()) {
      throw new Error(`API Error: ${res.error.message}`);
    }
    this.agents = res.value;
    console.log(this.agents);
    console.info(
      {
        path: this.agentsPath,
      },
      "Updated agents list"
    );
    await fs.writeFile(this.agentsPath, JSON.stringify(this.agents, null, 2));
  }

  async init() {
    // Create config path if needed
    await fs.mkdir(this.configPath, { recursive: true });

    // Check that file credentials.json exists or create it empty
    if (!process.env.DUST_CLI_API_KEY) {
      throw new Error("DUST_CLI_API_KEY is not set");
    }
    if (!process.env.DUST_CLI_WORKSPACE_ID) {
      throw new Error("DUST_CLI_WORKSPACE_ID is not set");
    }
    if (!process.env.DUST_CLI_USER_EMAIL) {
      throw new Error("DUST_CLI_USER_EMAIL is not set");
    }
    this.credentials = {
      apiKey: process.env.DUST_CLI_API_KEY,
      workspaceId: process.env.DUST_CLI_WORKSPACE_ID,
      userEmail: process.env.DUST_CLI_USER_EMAIL,
    };

    if (process.env.DUST_CLI_URL) {
      this.url = process.env.DUST_CLI_URL;
    }

    console.log("URL", this.url);
    console.log(this.credentials);

    // Retrieve list of agents
    try {
      this.agents = JSON.parse(await fs.readFile(this.agentsPath, "utf-8"));
    } catch (err) {
      console.info("Fetching agents list for the first time...");
      await this.refreshAgentList();
    }

    // Retrieve list of conversations
    try {
      this.conversations = JSON.parse(
        await fs.readFile(this.conversationsPath, "utf-8")
      );
    } catch (err) {
      await fs.writeFile(this.conversationsPath, JSON.stringify("[]"));
      this.conversations = [];
    }
  }
}
