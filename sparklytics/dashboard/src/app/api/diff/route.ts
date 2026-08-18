import { NextResponse } from "next/server";
import { getReport } from "@/lib/reports";
import { diffReports } from "@/lib/diff";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");

  if (!a || !b) {
    return NextResponse.json(
      { error: "Query params ?a=<id>&b=<id> required" },
      { status: 400 }
    );
  }

  const reportA = getReport(a);
  const reportB = getReport(b);

  if (!reportA || !reportB) {
    return NextResponse.json(
      { error: "One or both reports not found" },
      { status: 404 }
    );
  }

  const diff = diffReports(reportA, reportB);
  return NextResponse.json(diff);
}
