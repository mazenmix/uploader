export function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function sanitizeFilename(input) {
  const value = String(input || "file")
    .replace(/[\\/\0]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return value || "file";
}

export function createId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function findObjectById(bucket, id) {
  const cleanId = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanId) return null;
  const result = await bucket.list({
    prefix: `${cleanId}/`,
    limit: 2,
    include: ["httpMetadata", "customMetadata"],
  });
  return result.objects[0] || null;
}

export function objectName(object) {
  if (object.customMetadata?.originalName) return object.customMetadata.originalName;
  const slash = object.key.indexOf("/");
  return slash >= 0 ? object.key.slice(slash + 1) : object.key;
}

export function objectId(object) {
  return object.key.split("/", 1)[0];
}
