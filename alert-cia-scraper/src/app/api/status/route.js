import { getScraperProgress } from "@/lib/progress";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  return Response.json({ success: true, progress: getScraperProgress() }, { headers: corsHeaders });
}
