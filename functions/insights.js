// ============================================================================
// Real Keeper Insight Microservice
// Separate Function to protect core prediction latency
// ============================================================================

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);

    // 1. CORS Headers
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=3600" // Cache for 1 hour to reduce load
    };

    // 2. Fetch Data Source
    // In Production (Pages), we fetch the static asset 'insight_data.json'
    try {
        const dataUrl = `${url.origin}/insight_data.json`;
        const resp = await fetch(dataUrl);

        if (!resp.ok) {
            throw new Error("Failed to load insight data");
        }

        const data = await resp.json();

        // 3. Return Data
        return new Response(JSON.stringify({ success: true, data: data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
}
