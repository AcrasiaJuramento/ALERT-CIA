import { getScraperProgress } from "@/lib/progress";
import { getCorsHeaders } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(request) {
  return Response.json(
    { success: true, progress: getScraperProgress() },
    { headers: getCorsHeaders(request) },
  );
}
