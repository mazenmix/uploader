import { findObjectById, objectName } from "../_lib/files.js";

function isPreviewable(type, name) {
  if (/^(image|video|audio)\//i.test(type)) return true;
  if (/^application\/pdf$/i.test(type)) return true;
  return /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|m4a|ogg|pdf)$/i.test(name);
}

function dispositionName(name) {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function onRequest({ request, env, params }) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const objectMeta = await findObjectById(env.FILES, params.id);
  if (!objectMeta) return new Response('File not found', { status: 404 });

  const name = objectName(objectMeta);
  const url = new URL(request.url);
  const forceDownload = url.searchParams.get('download') === '1';
  const rangeHeaders = request.headers.get('Range') ? request.headers : undefined;

  const object = request.method === 'HEAD'
    ? await env.FILES.head(objectMeta.key)
    : await env.FILES.get(objectMeta.key, rangeHeaders ? { range: rangeHeaders } : undefined);

  if (!object) return new Response('File not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'public, max-age=3600');

  const type = object.httpMetadata?.contentType || 'application/octet-stream';
  const mode = !forceDownload && isPreviewable(type, name) ? 'inline' : 'attachment';
  headers.set('Content-Disposition', `${mode}; ${dispositionName(name)}`);

  let status = 200;
  if (request.method === 'GET' && object.range && request.headers.get('Range')) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('Content-Length', String(length));
    status = 206;
  } else {
    headers.set('Content-Length', String(object.size));
  }

  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
}
