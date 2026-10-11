export function isAuthorized(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return false;
  // Keep existing bearer tokens valid while accepting percent-encoded UTF-8 tokens
  // from browsers. Authorization headers cannot carry arbitrary Unicode directly.
  const received = request.headers.get("Authorization");
  return received === `Bearer ${expected}` ||
    received === `Bearer ${encodeURIComponent(expected)}`;
}

export function requireAdmin(request, env) {
  if (isAuthorized(request, env)) return null;
  return Response.json(
    { error: "Unauthorized", message: "Enter the correct MX Files admin key." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
