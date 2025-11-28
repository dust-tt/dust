/**
 * Fix Ghost URLs in Contentful Blog Posts
 *
 * This script replaces __GHOST_URL__ with blog in all blog posts,
 * fixing URLs like https://dust.tt/__GHOST_URL__/slug/ to https://dust.tt/blog/slug/
 *
 * Usage:
 *   CONTENTFUL_MANAGEMENT_TOKEN=xxx node scripts/fix-ghost-urls-contentful.js
 *   CONTENTFUL_MANAGEMENT_TOKEN=xxx node scripts/fix-ghost-urls-contentful.js --dry-run
 *
 * Required env vars:
 *   - CONTENTFUL_MANAGEMENT_TOKEN: Your Contentful Management API token
 *   - CONTENTFUL_SPACE_ID (optional, defaults to 751ge4ljeqso)
 *
 * Options:
 *   --dry-run: Preview what would be fixed without making changes
 */

const contentful = require("contentful-management");

// Configuration
const SPACE_ID = process.env.CONTENTFUL_SPACE_ID || "751ge4ljeqso";
const ENVIRONMENT_ID = "master";
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Recursively search and replace __GHOST_URL__ with blog in a rich text node
 * Returns true if any replacements were made
 */
function fixGhostUrlsInNode(node) {
  let modified = false;

  if (!node) return false;

  // Check hyperlink URIs
  if (node.nodeType === "hyperlink" && node.data?.uri) {
    const originalUri = node.data.uri;
    const fixedUri = originalUri.replace(/__GHOST_URL__/g, "blog");
    if (fixedUri !== originalUri) {
      node.data.uri = fixedUri;
      modified = true;
      console.log(`    Fixed URL: ${originalUri} -> ${fixedUri}`);
    }
  }

  // Check text values (in case URLs appear as plain text)
  if (node.nodeType === "text" && node.value) {
    const originalValue = node.value;
    const fixedValue = originalValue.replace(/__GHOST_URL__/g, "blog");
    if (fixedValue !== originalValue) {
      node.value = fixedValue;
      modified = true;
      console.log(`    Fixed text: ${originalValue.substring(0, 50)}...`);
    }
  }

  // Recursively process content array
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      if (fixGhostUrlsInNode(child)) {
        modified = true;
      }
    }
  }

  return modified;
}

async function main() {
  const managementToken = process.env.CONTENTFUL_MANAGEMENT_TOKEN;

  console.log("=== Fix Ghost URLs in Contentful ===");
  console.log(`Space ID: ${SPACE_ID}`);
  console.log(`Environment: ${ENVIRONMENT_ID}`);
  console.log(
    `Token provided: ${managementToken ? "Yes (" + managementToken.substring(0, 10) + "...)" : "No"}`
  );
  console.log(`Dry run: ${DRY_RUN ? "Yes (no changes will be made)" : "No"}`);
  console.log("");

  if (!managementToken) {
    console.error(
      "Error: CONTENTFUL_MANAGEMENT_TOKEN environment variable is required"
    );
    console.error(
      "Get your token from: https://app.contentful.com/account/profile/cma_tokens"
    );
    process.exit(1);
  }

  // Initialize Contentful client
  console.log("Connecting to Contentful...");
  let environment;
  try {
    const client = contentful.createClient({
      accessToken: managementToken,
    });

    const space = await client.getSpace(SPACE_ID);
    console.log(`Connected to space: ${space.name}`);

    environment = await space.getEnvironment(ENVIRONMENT_ID);
    console.log(`Environment: ${ENVIRONMENT_ID}`);
  } catch (error) {
    console.error("\nFailed to connect to Contentful:");
    console.error(`  Error: ${error.message}`);
    process.exit(1);
  }

  // Fetch all blog posts
  console.log("\nFetching blog posts...");
  let allEntries = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const response = await environment.getEntries({
      content_type: "blogPage",
      limit,
      skip,
    });

    allEntries = allEntries.concat(response.items);
    console.log(`  Fetched ${allEntries.length} / ${response.total} entries`);

    if (allEntries.length >= response.total) {
      break;
    }
    skip += limit;
  }

  console.log(`\nProcessing ${allEntries.length} blog posts...`);

  let fixed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const entry of allEntries) {
    const title = entry.fields.title?.["en-US"] || "Untitled";
    const body = entry.fields.body?.["en-US"];

    if (!body) {
      console.log(`\n${title}: No body content`);
      unchanged++;
      continue;
    }

    // Check and fix __GHOST_URL__ in the body
    const wasModified = fixGhostUrlsInNode(body);

    if (!wasModified) {
      unchanged++;
      continue;
    }

    console.log(`\n${title}: Found __GHOST_URL__ references`);

    if (DRY_RUN) {
      console.log(`  Would fix: ${entry.sys.id}`);
      fixed++;
      continue;
    }

    try {
      // Unpublish if published (required to update)
      let entryToUpdate = entry;
      if (entry.sys.publishedVersion) {
        entryToUpdate = await entry.unpublish();
        console.log(`  Unpublished: ${entry.sys.id}`);
      }

      // Update the body field
      entryToUpdate.fields.body = { "en-US": body };
      entryToUpdate = await entryToUpdate.update();
      console.log(`  Updated: ${entry.sys.id}`);

      // Republish
      await entryToUpdate.publish();
      console.log(`  Published: ${entry.sys.id}`);

      fixed++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`  Error updating ${entry.sys.id}: ${error.message}`);
      errors++;
    }
  }

  console.log("\n========================================");
  console.log(DRY_RUN ? "Dry run complete!" : "Fix complete!");
  console.log(`  ${DRY_RUN ? "Would fix" : "Fixed"}: ${fixed}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
