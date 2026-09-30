import { requireAdmin } from "../_lib/auth.js";
import { createId, json, sanitizeFilename } from "../_lib/files.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // UI guardrail: 10 GiB

export async function onRequest(context) {
  const { request, env } = context;
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  if (!env.FILES) return json({ error: "R2 binding FILES is not configured." }, 500);

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (request.method === "POST" && action === "create") {
      const body = await request.json();
      const name = sanitizeFilename(body.name);
      const type = String(body.type || "application/octet-stream").slice(0, 150);
      const size = Number(body.size || 0);

      if (!Number.isFinite(size) || size <= 0) return json({ error: "Invalid file size." }, 400);
      if (size > MAX_FILE_SIZE) return json({ error: "This build accepts files up to 10 GiB." }, 413);

      const id = createId();
      const key = `${id}/${name}`;
      const upload = await env.FILES.createMultipartUpload(key, {
        httpMetadata: { contentType: type },
        customMetadata: {
          originalName: name,
          createdAt: new Date().toISOString(),
        },
      });

      return json({
        id,
        key,
        uploadId: upload.uploadId,
        directUrl: `${url.origin}/f/${id}`,
      });
    }

    if (request.method === "PUT" && action === "part") {
      const key = url.searchParams.get("key");
      const uploadId = url.searchParams.get("uploadId");
      const partNumber = Number(url.searchParams.get("partNumber"));

      if (!key || !uploadId || !Number.isInteger(partNumber) || partNumber < 1 || !request.body) {
        return json({ error: "Missing upload part parameters." }, 400);
      }

      const upload = env.FILES.resumeMultipartUpload(key, uploadId);
      const part = await upload.uploadPart(partNumber, request.body);
      return json(part);
    }

    if (request.method === "POST" && action === "complete") {
      const key = url.searchParams.get("key");
      const uploadId = url.searchParams.get("uploadId");
      if (!key || !uploadId) return json({ error: "Missing upload completion parameters." }, 400);

      const body = await request.json();
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (!parts.length) return json({ error: "No uploaded parts were supplied." }, 400);

      parts.sort((a, b) => a.partNumber - b.partNumber);
      const upload = env.FILES.resumeMultipartUpload(key, uploadId);
      const object = await upload.complete(parts);
      const id = key.split("/", 1)[0];

      return json({
        ok: true,
        id,
        key: object.key,
        size: object.size,
        etag: object.httpEtag,
        directUrl: `${url.origin}/f/${id}`,
      });
    }

    if (request.method === "DELETE" && action === "abort") {
      const key = url.searchParams.get("key");
      const uploadId = url.searchParams.get("uploadId");
      if (!key || !uploadId) return json({ error: "Missing abort parameters." }, 400);

      const upload = env.FILES.resumeMultipartUpload(key, uploadId);
      await upload.abort();
      return new Response(null, { status: 204 });
    }

    return json({ error: "Unsupported upload action." }, 405);
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}
