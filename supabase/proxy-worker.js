/**
 * Cloudflare Worker: прокси к Supabase (без отдачи сайта — та версия оказалась хуже,
 * ассеты шли вторым прыжком через Cloudflare и висели).
 *
 * Зачем: корпоративный DNS подменяет ответ для *.supabase.co, и прямые запросы
 * висят по 10-20 секунд. Воркер живёт на своём адресе, а в Supabase ходит снаружи.
 *
 * Как обновить:
 *   1. dash.cloudflare.com → Workers & Pages → izdelie-api → Edit code.
 *   2. Вставить этот файл целиком, Deploy.
 *   3. Сайт открывать как раньше: samthorsongm-netizen.github.io/izdelie-control/
 */

const SUPABASE_HOST = 'srmjwibpxcqorglbqaxs.supabase.co'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    const cors = {
      'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':
        request.headers.get('Access-Control-Request-Headers') ||
        'authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,x-client-info,x-supabase-api-version,range',
      'Access-Control-Expose-Headers': 'content-range,content-profile',
      'Access-Control-Max-Age': '86400',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const headers = new Headers(request.headers)
    headers.delete('host')
    headers.delete('origin')
    headers.delete('referer')

    const upstream = await fetch(`https://${SUPABASE_HOST}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    })

    const out = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(cors)) out.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers: out })
  },
}
