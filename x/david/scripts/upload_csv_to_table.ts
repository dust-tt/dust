/**
 * Upload a CSV file as a table in a Dust data source using the public API.
 *
 * Usage:
 *   npx tsx admin/upload_csv_to_table.ts \
 *     --csvPath path/to/file.csv \
 *     --workspaceId <wId> \
 *     --spaceId <spaceId> \
 *     --dataSourceId <dsId> \
 *     --tableName <name> \
 *     --apiKey <key> \
 *     [--dustApiUrl https://dust.tt] \
 *     [--tableDescription "description"] \
 *     [--batchSize 500]
 *
 * The script:
 *   1. Creates a table via POST /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/tables
 *   2. Parses the CSV locally
 *   3. Upserts rows in batches via POST .../tables/{tId}/rows
 */

import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const DUST_API_URL_DEFAULT = "https://dust.tt";
const BATCH_SIZE_DEFAULT = 500;

interface Args {
  csvPath: string;
  workspaceId: string;
  spaceId: string;
  dataSourceId: string;
  tableName: string;
  apiKey: string;
  dustApiUrl: string;
  tableDescription: string;
  batchSize: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    if (!value) {
      throw new Error(`Missing value for --${key}`);
    }
    map.set(key, value);
  }

  const required = [
    "csvPath",
    "workspaceId",
    "spaceId",
    "dataSourceId",
    "tableName",
    "apiKey",
  ];
  for (const key of required) {
    if (!map.has(key)) {
      throw new Error(`Missing required argument: --${key}`);
    }
  }

  return {
    csvPath: map.get("csvPath")!,
    workspaceId: map.get("workspaceId")!,
    spaceId: map.get("spaceId")!,
    dataSourceId: map.get("dataSourceId")!,
    tableName: map.get("tableName")!,
    apiKey: map.get("apiKey")!,
    dustApiUrl: map.get("dustApiUrl") ?? DUST_API_URL_DEFAULT,
    tableDescription: map.get("tableDescription") ?? "",
    batchSize: parseInt(map.get("batchSize") ?? String(BATCH_SIZE_DEFAULT), 10),
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

async function apiRequest(
  url: string,
  apiKey: string,
  method: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `API error ${res.status}: ${JSON.stringify(json, null, 2)}`
    );
  }
  return json;
}

async function main() {
  const args = parseArgs();

  // Read and parse CSV.
  const csvContent = fs.readFileSync(path.resolve(args.csvPath), "utf-8");
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error("CSV file is empty or has no data rows.");
  }

  // Build column name mapping (original -> slugified).
  const originalColumns = Object.keys(records[0]);
  const columnMap = new Map<string, string>();
  for (const col of originalColumns) {
    columnMap.set(col, slugify(col));
  }

  console.log(`Parsed ${records.length} rows with columns:`);
  for (const [original, slugified] of columnMap) {
    if (original !== slugified) {
      console.log(`  "${original}" -> "${slugified}"`);
    } else {
      console.log(`  "${original}"`);
    }
  }

  // Step 1: Create the table.
  const baseUrl = `${args.dustApiUrl}/api/v1/w/${args.workspaceId}/spaces/${args.spaceId}/data_sources/${args.dataSourceId}`;

  console.log(`\nCreating table "${args.tableName}"...`);
  const createResult = (await apiRequest(
    `${baseUrl}/tables`,
    args.apiKey,
    "POST",
    {
      name: args.tableName,
      title: args.tableName,
      description: args.tableDescription,
    }
  )) as { table: { table_id: string } };

  const tableId = createResult.table.table_id;
  console.log(`Table created with id: ${tableId}`);

  // Step 2: Upsert rows in batches.
  const rows = records.map((record, index) => {
    const value: Record<string, string | number | boolean | null> = {};
    for (const [original, slugified] of columnMap) {
      const raw = record[original];
      // Try to parse as number.
      if (raw !== "" && !isNaN(Number(raw))) {
        value[slugified] = Number(raw);
      } else {
        value[slugified] = raw;
      }
    }
    return {
      row_id: String(index),
      value,
    };
  });

  const totalBatches = Math.ceil(rows.length / args.batchSize);
  console.log(
    `\nUpserting ${rows.length} rows in ${totalBatches} batch(es)...`
  );

  for (let i = 0; i < totalBatches; i++) {
    const batch = rows.slice(i * args.batchSize, (i + 1) * args.batchSize);
    console.log(`  Batch ${i + 1}/${totalBatches} (${batch.length} rows)...`);
    await apiRequest(`${baseUrl}/tables/${tableId}/rows`, args.apiKey, "POST", {
      rows: batch,
      truncate: i === 0,
    });
  }

  console.log(
    `\nDone! Table "${args.tableName}" (${tableId}) uploaded with ${rows.length} rows.`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
