import { v4 as uuidv4 } from "uuid";

import { makeScript } from "@app/migrations/helpers";

makeScript(
  {
    requestsCount: { type: "number", demandOption: true, default: 100 },
    requestsSize: { type: "number", demandOption: true, default: 1000 },
    sleepMs: { type: "number", demandOption: true, default: 0 },
  },
  async ({ requestsCount, requestsSize, sleepMs, execute }) => {
    if (!execute) {
      console.log("There's no dry-run mode for this script");
      return;
    }
    for (let i = 0; i < requestsCount; i++) {
      const randomJsonArray = generateRandomStuff(requestsSize);
      const r = await fetch("http://localhost:3001/big-json-array", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ array: randomJsonArray }),
      });
      const status = r.status;
      const text = await r.text();
      console.log({ status, text });
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
);

function generateRandomStuff(n: number): Record<string, any>[] {
  // Define keys without specifying types beforehand
  const keys = [];
  for (let k = 0; k < 150; k++) {
    keys.push(uuidv4());
  }
  // Function to randomly decide the type for a key
  const randomType = () => (Math.random() > 0.5 ? "integer" : "string");
  // Function to generate a random value based on type
  const randomValue = (type: string): unknown => {
    return type === "integer"
      ? Math.floor(Math.random() * 100)
      : Math.random().toString(36).substring(2, 10);
  };
  // Assign random types to each key for this batch
  const keyTypes = keys.reduce((acc, key) => {
    acc[key] = randomType();
    return acc;
  }, {} as Record<string, string>);
  // Generate the template object to ensure each row has the same keys but with random values
  const templateValue: Record<string, unknown> = {};
  keys.forEach((key) => {
    const type = keyTypes[key];
    templateValue[key] = randomValue(type);
  });
  // Function to generate a single row
  const generateRow = () => {
    return {
      row_id: Math.random().toString(36).substring(2, 15),
      value: { ...templateValue },
    };
  };
  // Create an array of n rows
  const rows: Record<string, any>[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(generateRow());
  }
  return rows;
}
