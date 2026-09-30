import { requireAdmin } from "../_lib/auth.js";
import { json, objectId, objectName } from "../_lib/files.js";

export async function onRequestGet({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (!env.FILES) return json({ error: "R2 binding FILES is not configured." }, 500);

  try {
    const objects = [];
    let cursor;

    do {
      const page = await env.FILES.list({
        limit: 1000,
        cursor,
        include: ["httpMetadata", "customMetadata"],
      });
      objects.push(...page.objects);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    const files = objects
      .map((object) => ({
        id: objectId(object),
        key: object.key,
        name: objectName(object),
        size: object.size,
        uploaded: object.uploaded,
        contentType: object.httpMetadata?.contentType || "application/octet-stream",
        url: `/f/${objectId(object)}`,
      }))
      .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    const used = files.reduce((sum, file) => sum + file.size, 0);
    return json({
      files,
      storage: {
        used,
        freeTierReference: 10 * 1024 * 1024 * 1024,
        count: files.length,
      },
    });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}
