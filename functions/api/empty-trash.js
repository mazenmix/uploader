import { requireAdmin } from "../_lib/auth.js";
import { addActivity, json } from "../_lib/files.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAdmin(request, env);
  if (denied) return denied;
  if (!env.FILES) return json({ error: "R2 binding FILES is not configured." }, 500);

  try {
    let deleted = 0;
    while (true) {
      const page = await env.FILES.list({ prefix: "_mx/trash/", limit: 1000 });
      const keys = page.objects.map((object) => object.key);
      if (!keys.length) break;
      await env.FILES.delete(keys);
      deleted += keys.length;
      if (keys.length < 1000) break;
    }

    await addActivity(env.FILES, "trash.emptied", { deleted });
    return json({ ok: true, deleted });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}
