/**
 * Public uptime monitor endpoint.
 *
 * Monitor this URL with UptimeRobot:
 * /api/health
 *
 * The existing VITE_SUPABASE_* values are already required by the frontend,
 * so this route needs no additional Vercel configuration.
 */
export default async function handler(request, response) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    response.status(503).json({ status: 'unavailable' })
    return
  }

  try {
    const databaseResponse = await fetch(`${supabaseUrl}/rest/v1/settings?select=id&limit=1`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    })

    if (!databaseResponse.ok) {
      response.status(503).json({ status: 'unavailable' })
      return
    }

    response.setHeader('Cache-Control', 'no-store')
    response.status(200).json({ status: 'ok' })
  } catch {
    response.status(503).json({ status: 'unavailable' })
  }
}
