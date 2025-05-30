import { faker } from "@faker-js/faker";
import { NotionClient } from "../clients/notion-client";
import {
  CreatePageResponse,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";

interface ActivitySimulationOptions {
  intervalMs: number;
  durationMs: number;
  updatesPerInterval: number;
}

interface WorkspaceResult {
  pageIds: string[];
  databaseIds: string[];
}

export class ActivitySimulator {
  private timer: NodeJS.Timeout | null = null;
  private startTime: number = 0;

  constructor(
    private notionClient: NotionClient,
    private workspaceResult: WorkspaceResult
  ) {}

  startSimulation(options: ActivitySimulationOptions): void {
    this.startTime = Date.now();

    this.timer = setInterval(() => {
      this.performRandomUpdates(options.updatesPerInterval);

      // Check if we've reached the duration
      if (
        options.durationMs > 0 &&
        Date.now() - this.startTime >= options.durationMs
      ) {
        this.stopSimulation();
      }
    }, options.intervalMs);

    // Prevent the process from exiting while the timer is active
    if (this.timer.unref) {
      this.timer.unref();
    }

    console.log(
      `Activity simulation started. Will run for ${
        options.durationMs > 0
          ? Math.round(options.durationMs / 60000) + " minutes"
          : "indefinitely"
      }.`
    );
  }

  stopSimulation(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("Activity simulation stopped.");
    }
  }

  private async performRandomUpdates(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      try {
        const updateType = faker.helpers.arrayElement([
          "updatePage",
          "addContentToPage",
          "createNewPage",
          "updateDatabaseItem",
        ]);

        switch (updateType) {
          case "updatePage":
            await this.updateRandomPage();
            break;
          case "addContentToPage":
            await this.addContentToRandomPage();
            break;
          case "createNewPage":
            await this.createNewPage();
            break;
          case "updateDatabaseItem":
            await this.updateRandomDatabaseItem();
            break;
        }
      } catch (error) {
        console.error("Error performing random update:", error);
      }
    }
  }

  private async updateRandomPage(): Promise<void> {
    if (this.workspaceResult.pageIds.length === 0) return;

    const pageId = faker.helpers.arrayElement(this.workspaceResult.pageIds);

    await this.notionClient.updatePage(pageId, {
      properties: {
        title: [
          {
            type: "text",
            text: {
              content: faker.company.catchPhrase(),
            },
          },
        ],
      },
    });

    console.log(`Updated page ${pageId}`);
  }

  private async addContentToRandomPage(): Promise<void> {
    if (this.workspaceResult.pageIds.length === 0) return;

    const pageId = faker.helpers.arrayElement(this.workspaceResult.pageIds);

    await this.notionClient.appendBlockChildren(pageId, [
      {
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: faker.lorem.paragraph(),
              },
            },
          ],
        },
      },
    ]);

    console.log(`Added content to page ${pageId}`);
  }

  private async createNewPage(): Promise<void> {
    if (this.workspaceResult.pageIds.length === 0) return;

    const parentId = faker.helpers.arrayElement([
      ...this.workspaceResult.pageIds,
      ...this.workspaceResult.databaseIds,
    ]);

    const isDatabase = this.workspaceResult.databaseIds.includes(parentId);

    const page = await this.notionClient.createPage({
      parent: isDatabase
        ? {
            type: "database_id",
            database_id: parentId,
          }
        : {
            type: "page_id",
            page_id: parentId,
          },
      properties: isDatabase
        ? {
            Name: {
              title: [
                { type: "text", text: { content: faker.lorem.words(3) } },
              ],
            },
          }
        : {
            title: [{ type: "text", text: { content: faker.lorem.words(3) } }],
          },
      children: [
        {
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: faker.lorem.paragraph(),
                },
              },
            ],
          },
        },
      ],
    });

    this.workspaceResult.pageIds.push(page.id);
    console.log(`Created new page ${page.id} under ${parentId}`);
  }

  private async updateRandomDatabaseItem(): Promise<void> {
    if (this.workspaceResult.databaseIds.length === 0) return;

    const databaseId = faker.helpers.arrayElement(
      this.workspaceResult.databaseIds
    );

    // Query the database to get items
    const queryResult = await this.notionClient.queryDatabase(databaseId);

    if (queryResult.results.length === 0) return;

    // Pick a random item
    const item = faker.helpers.arrayElement(queryResult.results);

    // Update a property
    await this.notionClient.updatePage(item.id, {
      properties: {
        Name: {
          title: [
            {
              type: "text",
              text: {
                content: faker.company.catchPhrase(),
              },
            },
          ],
        },
      },
    });

    console.log(`Updated database item ${item.id} in database ${databaseId}`);
  }
}
