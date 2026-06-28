import { requireAuthorizedScraperUser } from "@/lib/auth";
import { getCorsHeaders } from "@/lib/cors";
import { runScraper } from "@/lib/runScraper";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request) {
  const headers = getCorsHeaders(request);

  try {
    const auth = await requireAuthorizedScraperUser(request);
    if (!auth.authorized) {
      return Response.json(
        { success: false, error: auth.message },
        { status: auth.status, headers },
      );
    }

    const result = await runScraper({ endpointType: "incidents" });
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500, headers },
    );
  }
}
