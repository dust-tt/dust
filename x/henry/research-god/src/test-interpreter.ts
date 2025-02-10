import { InterpreterService } from "./services/interpreter";
import type { ExecutionResult } from "./types/interpreter";

async function main(): Promise<void> {
  try {
    const interpreter = new InterpreterService();

    console.log("\n=== Basic Python Test ===");
    const result1 = await interpreter.executeCode({
      code: `
print('Hello from MicroPython!')
x = 42
y = 13
print(f'The answer is {x + y}')
`,
      timeout: 5000,
    });

    if (!result1.error) {
      console.log("Execution successful!");
      console.log("Output:", result1.output);
    } else {
      console.error("Execution failed:", result1.error);
    }

    console.log("\n=== List Comprehension Test ===");
    const result2 = await interpreter.executeCode({
      code: `
numbers = [1, 2, 3, 4, 5]
squares = [x * x for x in numbers]
print(f'Original numbers: {numbers}')
print(f'Squared numbers: {squares}')
`,
      timeout: 5000,
    });

    if (!result2.error) {
      console.log("Execution successful!");
      console.log("Output:", result2.output);
    } else {
      console.error("Execution failed:", result2.error);
    }

    interpreter.terminate();
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

main().catch((error) => {
  console.error(
    "Unhandled error:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
