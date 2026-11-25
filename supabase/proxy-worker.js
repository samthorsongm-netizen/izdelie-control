/**
 * Прокси к Supabase через Cloudflare Worker (бесплатный план).
 *
 * Зачем: корпоративный DNS подменяет ответ для *.supabase.co, и запросы висят
 * по 10-20 секунд. Воркер живёт на своём адресе, а в Supabase ходит снаружи.
 *
 * Как поднять (10 минут, карта не нужна):
 *   1. cloudflare.com → регистрация → Workers & Pages → Create → Worker.
 *   2. Вставить этот файл целиком в редактор, Deploy.
 *   3. Скопировать адрес вида https://izdelie-api.<твой-ник>.workers.dev
 *   4. В app/.env.production заменить строку:
 *        VITE_SUPABASE_URL=https://srmjwibpxcqorglbqaxs.supabase.co
 *      на адрес воркера, закоммитить — CI пересоберёт сайт.
 *   5. Проверить: открыть <адрес воркера>/auth/v1/health — должен ответить быстро.
 *
 * Если workers.dev в сети тоже закрыт — привязать к воркеру свой домен
 * (Workers → Settings → Domains & Routes → Custom domain).
 *
 * Ограничения бесплатного плана: 100 000 запросов в сутки — с запасом.
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
