import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { loadCSV, validateCSV } from "./csv-loader"
import { writeFile, unlink, mkdir } from "fs/promises"
import { join } from "path"

const TEST_DIR = "/tmp/dust-eval-tests"

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true })
})

afterAll(async () => {
  // Clean up test files
  try {
    const fs = await import("fs/promises")
    const files = await fs.readdir(TEST_DIR)
    for (const file of files) {
      await unlink(join(TEST_DIR, file))
    }
    await fs.rmdir(TEST_DIR)
  } catch {
    // Ignore cleanup errors
  }
})

describe("loadCSV", () => {
  test("loads valid CSV file", async () => {
    const csvPath = join(TEST_DIR, "valid.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt
"What is 2+2?","Answer should be 4"
"What is the capital of France?","Should be Paris"`
    )

    const result = await loadCSV(csvPath, {
      sample: undefined,
      seed: undefined,
      promptFilter: undefined,
    })

    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toHaveLength(2)
      expect(result.value[0]?.prompt).toBe("What is 2+2?")
      expect(result.value[0]?.judge_prompt).toBe("Answer should be 4")
    }
  })

  test("returns error for missing file", async () => {
    const result = await loadCSV("/nonexistent/path.csv", {
      sample: undefined,
      seed: undefined,
      promptFilter: undefined,
    })

    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("not found")
    }
  })

  test("returns error for missing columns", async () => {
    const csvPath = join(TEST_DIR, "missing-cols.csv")
    await writeFile(
      csvPath,
      `prompt,other_column
"What is 2+2?","some value"`
    )

    const result = await loadCSV(csvPath, {
      sample: undefined,
      seed: undefined,
      promptFilter: undefined,
    })

    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("judge_prompt")
    }
  })

  test("returns error for empty CSV", async () => {
    const csvPath = join(TEST_DIR, "empty.csv")
    await writeFile(csvPath, "")

    const result = await loadCSV(csvPath, {
      sample: undefined,
      seed: undefined,
      promptFilter: undefined,
    })

    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("empty")
    }
  })

  test("samples prompts when sample option is set", async () => {
    const csvPath = join(TEST_DIR, "sample.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt
"Q1","A1"
"Q2","A2"
"Q3","A3"
"Q4","A4"
"Q5","A5"`
    )

    const result = await loadCSV(csvPath, {
      sample: 2,
      seed: 42,
      promptFilter: undefined,
    })

    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toHaveLength(2)
    }
  })

  test("sampling with same seed gives same results", async () => {
    const csvPath = join(TEST_DIR, "seed-test.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt
"Q1","A1"
"Q2","A2"
"Q3","A3"
"Q4","A4"
"Q5","A5"`
    )

    const result1 = await loadCSV(csvPath, {
      sample: 3,
      seed: 12345,
      promptFilter: undefined,
    })
    const result2 = await loadCSV(csvPath, {
      sample: 3,
      seed: 12345,
      promptFilter: undefined,
    })

    expect(result1.isOk).toBe(true)
    expect(result2.isOk).toBe(true)
    if (result1.isOk && result2.isOk) {
      expect(result1.value.map((r) => r.prompt)).toEqual(
        result2.value.map((r) => r.prompt)
      )
    }
  })

  test("filters by index range", async () => {
    const csvPath = join(TEST_DIR, "filter-range.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt
"Q1","A1"
"Q2","A2"
"Q3","A3"
"Q4","A4"
"Q5","A5"`
    )

    const result = await loadCSV(csvPath, {
      sample: undefined,
      seed: undefined,
      promptFilter: "2-4",
    })

    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toHaveLength(3)
      expect(result.value[0]?.prompt).toBe("Q2")
      expect(result.value[2]?.prompt).toBe("Q4")
    }
  })

  test("filters by comma-separated indices", async () => {
    const csvPath = join(TEST_DIR, "filter-indices.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt
"Q1","A1"
"Q2","A2"
"Q3","A3"
"Q4","A4"
"Q5","A5"`
    )

    const result = await loadCSV(csvPath, {
      sample: undefined,
      seed: undefined,
      promptFilter: "1,3,5",
    })

    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toHaveLength(3)
      expect(result.value[0]?.prompt).toBe("Q1")
      expect(result.value[1]?.prompt).toBe("Q3")
      expect(result.value[2]?.prompt).toBe("Q5")
    }
  })

  test("filters by pattern", async () => {
    const csvPath = join(TEST_DIR, "filter-pattern.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt
"What is 2+2?","A1"
"Explain climate change","A2"
"What is 3+3?","A3"
"Describe weather patterns","A4"
"What is 4+4?","A5"`
    )

    const result = await loadCSV(csvPath, {
      sample: undefined,
      seed: undefined,
      promptFilter: "What is*",
    })

    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toHaveLength(3)
      expect(result.value[0]?.prompt).toContain("What is")
    }
  })
})

describe("validateCSV", () => {
  test("validates correct CSV", async () => {
    const csvPath = join(TEST_DIR, "validate-correct.csv")
    await writeFile(
      csvPath,
      `prompt,judge_prompt,extra
"Q1","A1","extra1"
"Q2","A2","extra2"`
    )

    const result = await validateCSV(csvPath)

    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value.rowCount).toBe(2)
      expect(result.value.columns).toContain("prompt")
      expect(result.value.columns).toContain("judge_prompt")
      expect(result.value.columns).toContain("extra")
    }
  })

  test("returns error for invalid CSV", async () => {
    const csvPath = join(TEST_DIR, "validate-invalid.csv")
    await writeFile(
      csvPath,
      `wrong_column,another
"Q1","A1"`
    )

    const result = await validateCSV(csvPath)

    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("prompt")
    }
  })
})
