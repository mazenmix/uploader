import { requireAdmin } from "../_lib/auth.js";
import { findObjectById, json, sanitizeFilename } from "../_lib/files.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  try {
    const { id, name: requestedName } = await request.json();
    const name = sanitizeFilename(requestedName);
    const object = await findObjectById(env.FILES, id);
    if (!object) return json({ error: "File not found." }, 404);

    const newKey = `${id}/${name}`;
    if (newKey === object.key) return json({ ok: true, id, name });

    const source = await env.FILES.get(object.key);
    if (!source) return json({ error: "File body not found." }, 404);

    await env.FILES.put(newKey, source.body, {
      httpMetadata: source.httpMetadata,
      customMetadata: {
        ...(source.customMetadata || {}),
        originalName: name,
      },
    });
    await env.FILES.delete(object.key);

    return json({ ok: true, id, name, url: `/f/${id}` });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}
