import type { CoreAPIRow } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

import logger from "@app/logger/logger";

async function main() {
  // for (let i = 0; i < 1; i++) {
  //   const r = await fetch("http://localhost:30042/");
  //   const status = r.status;
  //   const text = await r.text();
  //   console.log({ status, text });
  // }
  // for (let i = 0; i < 1000; i++) {
  //   const randomBigText = JSON.stringify(generateRandomRow(1000));
  //   const r = await fetch("http://localhost:30042/big-text", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({ text: randomBigText }),
  //   });
  //   const status = r.status;
  //   const text = await r.text();
  //   console.log({ status, text });
  // }
  for (let i = 0; i < 1000000; i++) {
    const randomJsonArray = generateRandomRow(20000);
    const r = await fetch("http://localhost:30042/big-json-array", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ array: randomJsonArray }),
    });
    const status = r.status;
    const text = await r.text();
    console.log({ status, text });
  }
}

main()
  .then(
    () => {
      console.log("done");
    },
    (e) => {
      console.error(e);
    }
  )
  .catch((e) => {
    console.error(e);
  });

function generateRandomRow(n: number): CoreAPIRow[] {
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
  const generateRow = (): CoreAPIRow => {
    return {
      row_id: Math.random().toString(36).substring(2, 15),
      value: { ...templateValue },
    };
  };

  // Create an array of n rows
  const rows: CoreAPIRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push(generateRow());
  }

  return rows;
}
