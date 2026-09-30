export function isAuthorized(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return false;
  return request.headers.get("Authorization") === `Bearer ${expected}`;
}

export function requireAdmin(request, env) {
  if (isAuthorized(request, env)) return null;
  return Response.json(
    { error: "Unauthorized", message: "Enter the correct MX Files admin key." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
