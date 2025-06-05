import { faker } from "@faker-js/faker";
import { NotionClient } from "../clients/notion-client";
import { PageTemplates } from "../models/page-template";
import {
  CreatePageResponse,
  AppendBlockChildrenResponse,
  BlockObjectRequest,
} from "@notionhq/client/build/src/api-endpoints";

export class PageGenerator {
  constructor(private notionClient: NotionClient) {}

  async createPage(
    parentId: string,
    templateType: keyof typeof PageTemplates = "default"
  ): Promise<CreatePageResponse> {
    const template = PageTemplates[templateType];
    const pageTitle = faker.lorem.words(3);

    // Create the page with properly typed parent
    const page = await this.notionClient.createPage({
      parent: parentId.includes("-")
        ? {
            type: "page_id",
            page_id: parentId,
          }
        : {
            type: "database_id",
            database_id: parentId,
          },
      properties: this.generatePageProperties(pageTitle, parentId),
      children: [],
    });

    // Add content blocks to the page
    await this.addContentToPage(page.id, template);

    return page;
  }

  private generatePageProperties(title: string, parentId: string): any {
    const titleContent = [
      {
        type: "text",
        text: {
          content: title,
        },
      },
    ];

    // If parent is a database, we need to match its schema
    if (!parentId.includes("-")) {
      return {
        Name: {
          title: titleContent,
        },
      };
    }

    // If parent is a page, we just need a title
    return {
      title: titleContent,
    };
  }

  async addContentToPage(pageId: string, template: any): Promise<void> {
    const blocks = this.generateContentBlocks(template) as BlockObjectRequest[];

    // Add blocks in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < blocks.length; i += batchSize) {
      const batch = blocks.slice(i, i + batchSize);
      await this.notionClient.appendBlockChildren(pageId, batch);
    }
  }

  private generateContentBlocks(template: any) {
    const blocks = [];

    // Generate heading
    blocks.push(this.generateHeadingBlock(1, faker.company.catchPhrase()));

    // Generate paragraph
    blocks.push(this.generateParagraphBlock(faker.lorem.paragraph(3)));

    // Generate callout
    blocks.push(this.generateCalloutBlock(faker.lorem.sentence(), "💡"));

    // If template includes a table of contents
    if (template.includeTableOfContents) {
      blocks.push({ table_of_contents: {} });
    }

    // Generate sections
    const sectionCount = faker.number.int({ min: 2, max: 5 });
    for (let i = 0; i < sectionCount; i++) {
      blocks.push(this.generateHeadingBlock(2, faker.company.buzzPhrase()));
      blocks.push(this.generateParagraphBlock(faker.lorem.paragraphs(2)));

      // Add a list
      if (faker.datatype.boolean()) {
        blocks.push(...this.generateListBlocks());
      }

      // Add a to-do list
      if (faker.datatype.boolean()) {
        blocks.push(...this.generateTodoBlocks());
      }

      // Add a quote
      if (faker.datatype.boolean()) {
        blocks.push(this.generateQuoteBlock(faker.lorem.sentence()));
      }
    }

    // Add a divider
    blocks.push({ divider: {} });

    // Add a table if specified
    if (template.includeTable) {
      blocks.push(this.generateTableBlock());
    }

    return blocks;
  }

  private generateHeadingBlock(level: 1 | 2 | 3, text: string) {
    return {
      [`heading_${level}`]: {
        rich_text: [
          {
            type: "text",
            text: {
              content: text,
            },
          },
        ],
      },
    };
  }

  private generateParagraphBlock(text: string) {
    return {
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              content: text,
            },
          },
        ],
      },
    };
  }

  private generateCalloutBlock(text: string, emoji: string) {
    return {
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content: text,
            },
          },
        ],
        icon: {
          type: "emoji",
          emoji,
        },
      },
    };
  }

  private generateListBlocks() {
    const blocks = [];
    const itemCount = faker.number.int({ min: 3, max: 6 });

    for (let i = 0; i < itemCount; i++) {
      blocks.push({
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: faker.lorem.sentence(),
              },
            },
          ],
        },
      });
    }

    return blocks;
  }

  private generateTodoBlocks() {
    const blocks = [];
    const itemCount = faker.number.int({ min: 3, max: 6 });

    for (let i = 0; i < itemCount; i++) {
      blocks.push({
        to_do: {
          rich_text: [
            {
              type: "text",
              text: {
                content: faker.lorem.sentence(),
              },
            },
          ],
          checked: faker.datatype.boolean(0.3), // 30% chance to be checked
        },
      });
    }

    return blocks;
  }

  private generateQuoteBlock(text: string) {
    return {
      quote: {
        rich_text: [
          {
            type: "text",
            text: {
              content: text,
            },
          },
        ],
      },
    };
  }

  private generateTableBlock() {
    return {
      table: {
        table_width: 3,
        has_column_header: true,
        has_row_header: false,
        children: [
          {
            table_row: {
              cells: [
                [{ type: "text", text: { content: "Header 1" } }],
                [{ type: "text", text: { content: "Header 2" } }],
                [{ type: "text", text: { content: "Header 3" } }],
              ],
            },
          },
          {
            table_row: {
              cells: [
                [{ type: "text", text: { content: faker.lorem.word() } }],
                [{ type: "text", text: { content: faker.lorem.word() } }],
                [{ type: "text", text: { content: faker.lorem.word() } }],
              ],
            },
          },
          {
            table_row: {
              cells: [
                [{ type: "text", text: { content: faker.lorem.word() } }],
                [{ type: "text", text: { content: faker.lorem.word() } }],
                [{ type: "text", text: { content: faker.lorem.word() } }],
              ],
            },
          },
        ],
      },
    };
  }
}
