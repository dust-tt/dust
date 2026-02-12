// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { NextResponse } from "next/server";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function GET() {
  return NextResponse.json("Hello, World!", { status: 200 });
}
