import { Dataset, Example, ProblemId } from "../datasets";

type Operator = "+" | "-" | "*" | "/";

const OPERATORS: Operator[] = ["+", "-", "*", "/"];

function isOperation(element: Element): element is Operator {
  return (
    element === "+" || element === "-" || element === "*" || element === "/"
  );
}

type Element = number | Operator;

class KryptoK extends Dataset {
  readonly name = "Krypto4";
  private k: number;

  constructor(k: number) {
    super();
    this.k = k;
  }

  polish(depth: number): { expr: Element[]; value: number } {
    if (depth <= 0) {
      let v = Math.floor(Math.random() * 9) + 1;
      return { expr: [v], value: v };
    }

    const d1 = Math.floor(Math.random() * depth);
    const d2 = Math.floor(Math.random() * depth);

    const operator = OPERATORS[Math.floor(Math.random() * OPERATORS.length)];

    // console.log({ depth, d1, d2 });

    const op1 = this.polish(d1);
    const op2 = this.polish(d2);

    let value: number;
    switch (operator) {
      case "+":
        value = op1.value + op2.value;
        break;
      case "-":
        value = op1.value - op2.value;
        break;
      case "*":
        value = op1.value * op2.value;
        break;
      case "/":
        value = Math.floor(op1.value / op2.value);
        break;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }

    return {
      expr: [operator, ...op1.expr, ...op2.expr],
      value,
    };
  }

  generateExample(): Example {
    const { expr, value } = this.polish(this.k);

    const numbers = expr
      .filter((e) => !isOperation(e))
      .sort(() => Math.random() - 0.5) as number[];

    const question =
      `Given the input numbers [${numbers.join(", ")}],` +
      ` find an expression that evaluates to the target value ${value}.`;
  }

  instructions(): string {
    return (
      `Given a set of input numbers, find a mathematical expression using each number` +
      ` only once that evaluates to the target value.` +
      ` The available operators are [${OPERATORS.join(", ")}]` +
      ` (the division operator / is the integer division (eg: 5/2 = 2)).` +
      ` The final expression should be wrapped in a LaTeX-like \\boxed{...} using polish notation` +
      ` (eg: \\boxed{+ 4 * 2 7}).`
    );
  }

  tests({ count }: { count: number }) {
    return [];
  }

  examples({ problem, count }: { problem: ProblemId; count: number }) {
    return [];
  }
}

(() => {
  const k = new KryptoK(4);
  for (var i = 0; i < 10; i++) {
    console.log(k.polish(2));
  }
})();
