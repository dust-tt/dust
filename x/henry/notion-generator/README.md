# Fake Notion Workspace Generator

This tool programmatically creates a large, realistic Notion workspace.

## Features

- **Authentication and Setup**: Secure integration with Notion's API
- **Realistic Database Structures**: Creation of various database types with appropriate properties
- **Page Content Generation**: Realistic content creation using Faker.js
- **Hierarchical Organization**: Proper nesting of pages and databases
- **Activity Simulation**: Ongoing updates to mimic real user behavior
- **Error Handling**: Robust handling of API rate limits and errors

## Setup

1. Clone the repository
2. Install dependencies and type definitions:
   ```bash
   ./setup.sh
   ```
   This will:
   - Install all required dependencies
   - Install TypeScript type definitions
   - Create a `.env` file from the example
   - Build the project
3. Update the `.env` file with your Notion API credentials:
   ```
   NOTION_API_KEY=your_notion_integration_secret
   PARENT_PAGE_ID=your_parent_page_id
   ```

## Create a Notion Integration

1. Go to https://www.notion.com/my-integrations
2. Click "New integration"
3. Name it "Fake Workspace Generator"
4. Select the workspace where you want to create the fake content
5. Select the capabilities (needs content read/write permissions)
6. Copy the "Internal Integration Secret" to your `.env` file

## Share a Page with Your Integration

1. Create a new page in your Notion workspace to serve as the parent for the fake workspace
2. Share this page with your integration by clicking "Share" and selecting your integration
3. Copy the page ID from the URL (the 32-character string after the last slash and before the question mark)
4. Add this to your `.env` file as `PARENT_PAGE_ID`

## Run the Generator

```bash
# Build the TypeScript code
npm run build

# Run the generator
npm start
```

## Customization

You can customize the workspace generation by modifying the following:

1. **Database Schemas**: Edit `src/models/database-schema.ts` to add or modify database types
2. **Page Templates**: Edit `src/models/page-template.ts` to add or modify page templates
3. **Content Generation**: Modify the content generation logic in `src/generators/content.ts`
4. **Activity Patterns**: Adjust activity simulation in `src/generators/activity.ts`
5. **Configuration**: Update the settings in your `.env` file
