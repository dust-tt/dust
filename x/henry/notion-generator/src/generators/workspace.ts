import { faker } from "@faker-js/faker";
import { NotionClient } from "../clients/notion-client";
import { DatabaseGenerator } from "./database";
import { PageGenerator } from "./page";
import { DatabaseSchemas } from "../models/database-schema";
import { PageTemplates } from "../models/page-template";
import {
  CreateDatabaseResponse,
  CreatePageResponse,
} from "@notionhq/client/build/src/api-endpoints";

interface WorkspaceGenerationOptions {
  databasesCount: number;
  pagesCount: number;
  childrenPerPage: number;
  maxDepth: number;
}

interface WorkspaceResult {
  pageIds: string[];
  databaseIds: string[];
}

export class WorkspaceGenerator {
  private databaseGenerator: DatabaseGenerator;
  private pageGenerator: PageGenerator;

  constructor(private notionClient: NotionClient) {
    this.databaseGenerator = new DatabaseGenerator(notionClient);
    this.pageGenerator = new PageGenerator(notionClient);
  }

  async generateWorkspace(
    options: WorkspaceGenerationOptions
  ): Promise<WorkspaceResult> {
    const parentPageId = process.env.PARENT_PAGE_ID;

    if (!parentPageId) {
      throw new Error("PARENT_PAGE_ID environment variable is required");
    }

    console.log(
      `Starting workspace generation under parent page ${parentPageId}`
    );

    const result: WorkspaceResult = {
      pageIds: [],
      databaseIds: [],
    };

    // Create top-level pages
    console.log(`Creating ${options.pagesCount} top-level pages...`);
    const topLevelPages = await this.createTopLevelPages(
      parentPageId,
      options.pagesCount
    );
    result.pageIds.push(...topLevelPages);

    // Create databases
    console.log(`Creating ${options.databasesCount} databases...`);
    const databases = await this.createDatabases(
      parentPageId,
      options.databasesCount
    );
    result.databaseIds.push(...databases);

    // Create hierarchical structure
    console.log("Creating hierarchical page structure...");
    await this.createHierarchicalPages(result.pageIds, options, 1, result);

    console.log("Workspace generation complete!");
    console.log(
      `Created ${result.pageIds.length} pages and ${result.databaseIds.length} databases`
    );

    return result;
  }

  private async createTopLevelPages(
    parentPageId: string,
    count: number
  ): Promise<string[]> {
    const pageIds: string[] = [];

    for (let i = 0; i < count; i++) {
      try {
        // Select a random template type
        const templateTypes = Object.keys(PageTemplates) as Array<
          keyof typeof PageTemplates
        >;
        const templateType = faker.helpers.arrayElement(templateTypes);

        const page = await this.pageGenerator.createPage(
          parentPageId,
          templateType
        );
        pageIds.push(page.id);

        console.log(`Created top-level page ${i + 1}/${count}: ${page.id}`);
      } catch (error) {
        console.error(
          `Error creating top-level page ${i + 1}/${count}:`,
          error
        );
      }
    }

    return pageIds;
  }

  private async createDatabases(
    parentPageId: string,
    count: number
  ): Promise<string[]> {
    const databaseIds: string[] = [];

    // Get all database types
    const databaseTypes = Object.keys(DatabaseSchemas) as Array<
      keyof typeof DatabaseSchemas
    >;

    for (let i = 0; i < count; i++) {
      try {
        // Cycle through database types or pick random
        const dbType =
          count <= databaseTypes.length
            ? databaseTypes[i % databaseTypes.length]
            : faker.helpers.arrayElement(databaseTypes);

        const database = await this.databaseGenerator.createDatabase(
          parentPageId,
          dbType
        );
        databaseIds.push(database.id);

        console.log(
          `Created database ${i + 1}/${count}: ${database.id} (${dbType})`
        );
      } catch (error) {
        console.error(`Error creating database ${i + 1}/${count}:`, error);
      }
    }

    return databaseIds;
  }

  private async createHierarchicalPages(
    parentPageIds: string[],
    options: WorkspaceGenerationOptions,
    currentDepth: number,
    result: WorkspaceResult
  ): Promise<void> {
    if (currentDepth >= options.maxDepth || parentPageIds.length === 0) {
      return;
    }

    for (const parentId of parentPageIds) {
      // Skip if we've reached the maximum depth
      if (currentDepth >= options.maxDepth) {
        break;
      }

      const childCount = faker.number.int({
        min: 1,
        max: options.childrenPerPage,
      });

      const childPageIds: string[] = [];

      for (let i = 0; i < childCount; i++) {
        try {
          // Randomly decide if this should be a page or a database
          const isDatabase = faker.datatype.boolean(0.3); // 30% chance to be a database

          if (isDatabase) {
            // Create a database
            const databaseTypes = Object.keys(DatabaseSchemas) as Array<
              keyof typeof DatabaseSchemas
            >;
            const dbType = faker.helpers.arrayElement(databaseTypes);

            const database = await this.databaseGenerator.createDatabase(
              parentId,
              dbType
            );
            result.databaseIds.push(database.id);

            console.log(
              `Created child database under ${parentId}: ${database.id}`
            );
          } else {
            // Create a page
            const templateTypes = Object.keys(PageTemplates) as Array<
              keyof typeof PageTemplates
            >;
            const templateType = faker.helpers.arrayElement(templateTypes);

            const page = await this.pageGenerator.createPage(
              parentId,
              templateType
            );
            result.pageIds.push(page.id);
            childPageIds.push(page.id);

            console.log(`Created child page under ${parentId}: ${page.id}`);
          }
        } catch (error) {
          console.error(`Error creating child under ${parentId}:`, error);
        }
      }

      // Recursively create children for the new pages
      await this.createHierarchicalPages(
        childPageIds,
        options,
        currentDepth + 1,
        result
      );
    }
  }
}
