import { runScraper } from "@/lib/runScraper";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await runScraper({ endpointType: "incidents" });
    return Response.json(result);
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
