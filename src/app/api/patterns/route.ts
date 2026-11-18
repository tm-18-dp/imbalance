import { connection } from "next/server";
import { readUserPatterns } from "@/lib/patterns-data";

/** Your premium patterns from data/patterns.json, read fresh each time. */
export async function GET() {
  await connection();
  return Response.json(readUserPatterns());
}
