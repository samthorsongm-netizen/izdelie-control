/**
 * Cloudflare Worker: отдаёт сам сайт и проксирует Supabase с ОДНОГО адреса.
 *
 * Зачем: когда сайт на github.io, а данные на другом домене, браузер перед каждым
 * запросом шлёт отдельный OPTIONS-разрешение — два соединения на один запрос.
 * На сети с потерями это даёт вечные зависания. Один домен — нет CORS вообще.
 *
 * Что делает:
 *   /rest/…, /auth/…      → Supabase
 *   всё остальное           → файлы сайта с github.io
 *
 * Как обновить:
 *   1. dash.cloudflare.com → Workers & Pages → izdelie-api → Edit code.
 *   2. Вставить этот файл целиком, Deploy.
 *   3. Открыть https://izdelie-api.samthorson-gm.workers.dev/ — сайт должен открыться.
 */

const SUPABASE_HOST = 'srmjwibpxcqorglbqaxs.supabase.co'
const SITE_HOST = 'samthorsongm-netizen.github.io'
const SITE_BASE = '/izdelie-control/'

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // ---- API: /rest/... и /auth/... уходят в Supabase ----
    if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) {
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
    }

    // ---- корень: отправляем на сайт ----
    if (url.pathname === '/') {
      return Response.redirect(`${url.origin}${SITE_BASE}`, 302)
    }

    // ---- статика: файлы с GitHub Pages ----
    const headers = new Headers(request.headers)
    headers.delete('host')
    const res = await fetch(`https://${SITE_HOST}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      redirect: 'follow',
    })
    // content-length/encoding от исходного ответа не годятся: тело уже раскодировано
    const out = new Headers(res.headers)
    out.delete('content-encoding')
    out.delete('content-length')
    return new Response(res.body, { status: res.status, headers: out })
  },
}
