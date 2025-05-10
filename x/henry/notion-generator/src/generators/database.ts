import { faker } from "@faker-js/faker";
import { NotionClient } from "../clients/notion-client";
import { DatabaseSchemas } from "../models/database-schema";
import {
  CreateDatabaseResponse,
  CreatePageResponse,
} from "@notionhq/client/build/src/api-endpoints";

export class DatabaseGenerator {
  constructor(private notionClient: NotionClient) {}

  async createDatabase(
    parentPageId: string,
    type: keyof typeof DatabaseSchemas
  ): Promise<CreateDatabaseResponse> {
    const schema = DatabaseSchemas[type];

    // Generate database title
    const databaseTitle = faker.company.catchPhrase();

    // Create the database
    const response = await this.notionClient.createDatabase({
      parent: {
        type: "page_id",
        page_id: parentPageId,
      },
      title: [
        {
          type: "text",
          text: {
            content: databaseTitle,
          },
        },
      ],
      properties: this.generateProperties(schema.properties),
    });

    // Populate the database with items
    const itemCount = faker.number.int({
      min: schema.minItems || 5,
      max: schema.maxItems || 20,
    });

    for (let i = 0; i < itemCount; i++) {
      await this.createDatabaseItem(response.id, schema);
    }

    return response;
  }

  private generateProperties(propertySchema: any) {
    const properties: any = {};

    Object.entries(propertySchema).forEach(([name, config]: [string, any]) => {
      properties[name] = this.generatePropertyConfig(config);
    });

    return properties;
  }

  private generatePropertyConfig(config: any) {
    switch (config.type) {
      case "title":
        return { title: {} };
      case "rich_text":
        return { rich_text: {} };
      case "number":
        return { number: { format: config.format || "number" } };
      case "select":
        return {
          select: {
            options: config.options.map((option: string) => ({
              name: option,
              color: this.getRandomColor(),
            })),
          },
        };
      case "multi_select":
        return {
          multi_select: {
            options: config.options.map((option: string) => ({
              name: option,
              color: this.getRandomColor(),
            })),
          },
        };
      case "date":
        return { date: {} };
      case "people":
        return { people: {} };
      case "files":
        return { files: {} };
      case "checkbox":
        return { checkbox: {} };
      case "url":
        return { url: {} };
      case "email":
        return { email: {} };
      case "phone_number":
        return { phone_number: {} };
      case "formula":
        return { formula: { expression: config.expression } };
      case "relation":
        // Note: Relations need to be set up after both databases exist
        return { relation: { database_id: config.database_id || "" } };
      case "rollup":
        return {
          rollup: {
            relation_property_name: config.relation_property_name,
            rollup_property_name: config.rollup_property_name,
            function: config.function,
          },
        };
      case "status":
        const statusOption = faker.helpers.arrayElement(config.options) as {
          name: string;
        };
        return {
          status: {
            name: statusOption.name,
          },
        };
      default:
        return { [config.type]: {} };
    }
  }

  private getRandomColor() {
    const colors = [
      "blue",
      "green",
      "yellow",
      "red",
      "orange",
      "purple",
      "pink",
      "gray",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  async createDatabaseItem(
    databaseId: string,
    schema: any
  ): Promise<CreatePageResponse> {
    const properties = this.generateDatabaseItemProperties(schema.properties);

    return await this.notionClient.createPage({
      parent: {
        database_id: databaseId,
      },
      properties,
    });
  }

  private generateDatabaseItemProperties(propertySchema: any) {
    const properties: any = {};

    Object.entries(propertySchema).forEach(([name, config]: [string, any]) => {
      properties[name] = this.generatePropertyValue(name, config);
    });

    return properties;
  }

  private generatePropertyValue(name: string, config: any) {
    switch (config.type) {
      case "title":
        return {
          title: [
            {
              type: "text",
              text: {
                content:
                  name === "Name"
                    ? faker.company.catchPhrase()
                    : faker.lorem.words(3),
              },
            },
          ],
        };
      case "rich_text":
        return {
          rich_text: [
            {
              type: "text",
              text: {
                content: faker.lorem.paragraph(),
              },
            },
          ],
        };
      case "number":
        return {
          number: faker.number.float({ min: 0, max: 1000, precision: 0.01 }),
        };
      case "select":
        const selectOption = faker.helpers.arrayElement(config.options);
        return {
          select: {
            name: selectOption,
          },
        };
      case "multi_select":
        const count = faker.number.int({
          min: 0,
          max: Math.min(3, config.options.length),
        });
        const selections = faker.helpers.arrayElements(config.options, count);
        return {
          multi_select: selections.map((name: any) => ({ name: String(name) })),
        };
      case "date":
        return {
          date: {
            start: faker.date
              .between(new Date("2023-01-01"), new Date("2025-12-31"))
              .toISOString(),
          },
        };
      case "checkbox":
        return {
          checkbox: faker.datatype.boolean(),
        };
      case "url":
        return {
          url: faker.internet.url(),
        };
      case "email":
        return {
          email: faker.internet.email(),
        };
      case "phone_number":
        return {
          phone_number: faker.phone.number(),
        };
      case "status":
        const statusOption = faker.helpers.arrayElement(config.options) as {
          name: string;
        };
        return {
          status: {
            name: statusOption.name,
          },
        };
      // Other property types would follow similar patterns
      default:
        return {};
    }
  }
}
