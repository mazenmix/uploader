import { requireAdmin } from "../_lib/auth.js";
import { findObjectById, json } from "../_lib/files.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;

  try {
    const { id } = await request.json();
    const object = await findObjectById(env.FILES, id);
    if (!object) return json({ error: "File not found." }, 404);

    await env.FILES.delete(object.key);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}
