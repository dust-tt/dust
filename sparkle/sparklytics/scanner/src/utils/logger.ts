import chalk from "chalk";

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function info(msg: string): void {
  console.log(chalk.cyan("[scan]") + " " + msg);
}

export function success(msg: string): void {
  console.log(chalk.green("[done]") + " " + msg);
}

export function warn(msg: string): void {
  console.warn(chalk.yellow("[warn]") + " " + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("[error]") + " " + msg);
}

export function debug(msg: string): void {
  if (verbose) {
    console.log(chalk.gray("[debug]") + " " + msg);
  }
}

export function printSummaryTable(rows: [string, string | number][]): void {
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  console.log("\n" + chalk.bold("Scan Summary"));
  console.log("─".repeat(maxKey + 20));
  for (const [key, val] of rows) {
    const paddedKey = key.padEnd(maxKey + 2);
    console.log(`  ${chalk.gray(paddedKey)} ${chalk.white(String(val))}`);
  }
  console.log("─".repeat(maxKey + 20));
}
