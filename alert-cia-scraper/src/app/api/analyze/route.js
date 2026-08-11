import { analyzeArticleInput } from "@/lib/analyzeArticle";
import { requireAuthorizedScraperUser } from "@/lib/auth";
import { getCorsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, "GET, POST, OPTIONS"),
  });
}

export async function POST(request) {
  const corsHeaders = getCorsHeaders(request, "GET, POST, OPTIONS");
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

export async function GET(request) {
  const corsHeaders = getCorsHeaders(request, "GET, POST, OPTIONS");
  try {
    const auth = await requireAuthorizedScraperUser(request);
    if (!auth.authorized) {
      return Response.json(
        { success: false, error: auth.message },
        { status: auth.status, headers: corsHeaders },
      );
    }

    const { searchParams } = new URL(request.url);
    const payload = {
      url: searchParams.get("url") || "",
      title: searchParams.get("title") || "",
      snippet: searchParams.get("snippet") || "",
      body: searchParams.get("body") || "",
    };
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
