export const WORKFLOW_VERSION = 24;
export const QUEUE_NAME = `notion-queue-v${WORKFLOW_VERSION}`;

type X = "A" | "B" | "C";

const x: X = "A";

if (x === "A") {
  console.log("A");
} else if (x === "B") {
  console.log("B");
} else if (x === "C") {
  console.log("C");
} else {
  ((thing: never) => {
    throw new Error(`Unexpected thing: ${thing}`);
  })(x);
}
