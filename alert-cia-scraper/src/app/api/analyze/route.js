import { analyzeArticleInput } from "@/lib/analyzeArticle";
import { requireAuthorizedScraperUser } from "@/lib/auth";
import { getCorsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, "POST, OPTIONS"),
  });
}

export async function POST(request) {
  const corsHeaders = getCorsHeaders(request, "POST, OPTIONS");
  try {
    const auth = await requireAuthorizedScraperUser(request);
    if (!auth.authorized) {
      return Response.json(
        { success: false, error: auth.message },
        { status: auth.status, headers: corsHeaders },
      );
    }

    const payload = await request.json().catch(() => ({}));
    if (!payload.url && !payload.body && !payload.title) {
      return Response.json(
        { success: false, error: "Provide a URL or pasted article text to analyze." },
        { status: 400, headers: corsHeaders },
      );
    }

    const result = await analyzeArticleInput(payload);
    return Response.json(
      { ...result, triggeredBy: "user", userId: auth.user.id },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error.message || "Unable to analyze article." },
      { status: 500, headers: corsHeaders },
    );
  }
}
