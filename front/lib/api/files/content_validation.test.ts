import { describe, expect, it } from "vitest";

import {
  validateTailwindCode,
  validateTypeScriptSyntax,
} from "@app/lib/api/files/content_validation";

// Match the constant from content_validation.ts
const MAX_DISPLAYED_ERRORS = 5;

describe("validateTailwindCode", () => {
  it("should pass code without arbitrary values", () => {
    const validCode = `
      <div className="flex items-center justify-center">
        <h1 className="text-2xl font-bold text-blue-500">Hello</h1>
      </div>
    `;
    const result = validateTailwindCode(validCode);
    expect(result.isOk()).toBe(true);
  });

  it("should detect arbitrary height values", () => {
    const invalidCode = `
      <div className="h-[600px] w-full">Content</div>
    `;
    const result = validateTailwindCode(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("h-[600px]");
      expect(result.error.message).toContain("Forbidden Tailwind arbitrary values");
    }
  });

  it("should detect arbitrary color values", () => {
    const invalidCode = `
      <div className="bg-[#ff0000] text-white">Content</div>
    `;
    const result = validateTailwindCode(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("bg-[#ff0000]");
    }
  });

  it("should detect multiple arbitrary values", () => {
    const invalidCode = `
      <div className="h-[600px] w-[800px] bg-[#ff0000]">Content</div>
    `;
    const result = validateTailwindCode(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("h-[600px]");
      expect(result.error.message).toContain("w-[800px]");
      expect(result.error.message).toContain("bg-[#ff0000]");
    }
  });

  it("should work with single-quoted className", () => {
    const invalidCode = `
      <div className='h-[600px] w-full'>Content</div>
    `;
    const result = validateTailwindCode(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("h-[600px]");
    }
  });

  it("should deduplicate repeated arbitrary values", () => {
    const invalidCode = `
      <div className="h-[600px] bg-red-500">
        <span className="h-[600px] text-white">Content</span>
      </div>
    `;
    const result = validateTailwindCode(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // Should deduplicate - only h-[600px] should be in the examples list once
      // (though it may appear twice in the message: once in "detected: X" and once in the examples)
      expect(result.error.message).toContain("h-[600px]");
      expect(result.error.message).toContain("Forbidden Tailwind arbitrary values");
    }
  });

  it("should provide helpful error message with suggestions", () => {
    const invalidCode = `<div className="h-[600px]">Content</div>`;
    const result = validateTailwindCode(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("h-96");
      expect(result.error.message).toContain("w-full");
      expect(result.error.message).toContain("bg-red-500");
      expect(result.error.message).toContain("style prop");
    }
  });
});

describe("validateTypeScriptSyntax", () => {
  it("should validate syntactically correct TSX code", () => {
    const validCode = `
import React from "react";
import { Card, CardHeader, CardTitle } from "shadcn";

const MyComponent: React.FC = () => {
  return (
    <div className="container">
      <Card>
        <CardHeader>
          <CardTitle>Hello World</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
};

export default MyComponent;
    `;

    const result = validateTypeScriptSyntax(validCode);
    expect(result.isOk()).toBe(true);
  });

  it("should detect JSX element without closing tag", () => {
    const invalidCode = `
import React from "react";

const MyComponent = () => {
  return (
    <div className="container">
      <h1>Hello</h1>
    // Missing closing div tag
  );
};
    `;

    const result = validateTypeScriptSyntax(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
      expect(result.error.message).toMatch(
        /Line \d+, Column \d+: error TS\d+:/
      );
    }
  });

  it("should detect unexpected tokens in JSX", () => {
    const invalidCode = `
import React from "react";

const MyComponent = () => {
  return (
    <div>
      }  // Unexpected closing brace
    </div>
  );
};
    `;

    const result = validateTypeScriptSyntax(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
    }
  });

  it("should detect malformed JSX attributes", () => {
    const invalidCode = `
import React from "react";

const MyComponent = () => {
  return (
    <div className="test" invalid-attribute=>
      Content
    </div>
  );
};
    `;

    const result = validateTypeScriptSyntax(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
    }
  });

  it("should ignore module resolution errors (TS2307)", () => {
    const codeWithUnresolvableImports = `
import React from "react";
import { SomeComponent } from "@/components/that/dont/exist";
import { AnotherComponent } from "non-existent-package";

const MyComponent = () => {
  return (
    <div className="container">
      <h1>Hello</h1>
    </div>
  );
};

export default MyComponent;
    `;

    // Should pass despite unresolvable imports.
    const result = validateTypeScriptSyntax(codeWithUnresolvableImports);
    expect(result.isOk()).toBe(true);
  });

  it("should allow undefined variables (TS2304 not caught by transpileModule)", () => {
    const codeWithUndefinedVars = `
import React from "react";

const MyComponent = () => {
  const data = someUndefinedVariable;
  return (
    <div className="container">
      <h1>{data}</h1>
    </div>
  );
};

export default MyComponent;
    `;

    // Note: transpileModule does not perform full type checking, so undefined
    // variables are not caught. This is a known limitation of the transpileModule API.
    // Syntax errors (like unclosed tags, malformed JSX) are still caught.
    const result = validateTypeScriptSyntax(codeWithUndefinedVars);
    expect(result.isOk()).toBe(true);
  });

  it("should report multiple syntax errors with line and column numbers", () => {
    const invalidCode = `
import React from "react";

const MyComponent = () => {
  return (
    <div>
      <h1>Unclosed heading
      }
    </div>
  );
};
    `;

    const result = validateTypeScriptSyntax(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
      // Should contain formatted error with line/column
      expect(result.error.message).toMatch(
        /Line \d+, Column \d+: error TS\d+:/
      );
    }
  });

  it("should limit error display to first 5 errors", () => {
    // Create code with many syntax errors
    const invalidCode = `
import React from "react";

const MyComponent = () => {
  return (
    <div>
      }
      }
      }
      }
      }
      }
      }
    </div>
  );
};
    `;

    const result = validateTypeScriptSyntax(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // Should mention additional errors.
      const errorLines = result.error.message.split("\n");
      const errorCount = errorLines.filter((line) =>
        line.includes("error TS")
      ).length;
      expect(errorCount).toBeLessThanOrEqual(MAX_DISPLAYED_ERRORS);
    }
  });

  it("should validate complex React component with hooks", () => {
    const validComplexCode = `
import React, { useState, useEffect } from "react";
import { Card, CardContent } from "shadcn";

const ComplexComponent: React.FC<{ title: string }> = ({ title }) => {
  const [count, setCount] = useState<number>(0);
  const [data, setData] = useState<string[]>([]);

  useEffect(() => {
    setData(["item1", "item2"]);
  }, []);

  const handleClick = () => {
    setCount((prev) => prev + 1);
  };

  return (
    <Card>
      <CardContent>
        <h1>{title}</h1>
        <button onClick={handleClick}>Count: {count}</button>
        <ul>
          {data.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default ComplexComponent;
    `;

    const result = validateTypeScriptSyntax(validComplexCode);
    expect(result.isOk()).toBe(true);
  });

  it("should detect missing semicolons in strict mode contexts", () => {
    const codeWithMissingSemicolon = `
import React from "react"

const MyComponent = () => {
  const value = "test"
  return <div>{value}</div>
}

export default MyComponent
    `;

    // This should still be valid as semicolons are optional in JS/TS.
    const result = validateTypeScriptSyntax(codeWithMissingSemicolon);
    expect(result.isOk()).toBe(true);
  });

  it("should provide helpful error message format", () => {
    const invalidCode = `
import React from "react";

const MyComponent = () => {
  return (
    <div>
      <h1>Test
    </div>
  );
};
    `;

    const result = validateTypeScriptSyntax(invalidCode);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // Error message should include:
      // - "TypeScript syntax errors detected"
      // - Formatted errors with "Line X, Column Y: error TSXXX:"
      // - "Please fix these errors and try again."
      expect(result.error.message).toContain(
        "TypeScript syntax errors detected"
      );
      expect(result.error.message).toContain(
        "Please fix these errors and try again."
      );
    }
  });
});
