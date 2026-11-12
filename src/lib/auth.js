import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "research-collab-platform-dev-secret-f9c3a7e5d1b84f2a96c0e3d7b5a1f8c4e6d2b0a9f7c5e3d1b8a6f4c2e0d9b7a5f341";

const JWT_EXPIRATION = "24h"; // 86400000 ms

/* ------------------- Password helpers ------------------- */
export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

/* ------------------- JWT token helpers ------------------ */
export function signAuthToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );
}

export function verifyAuthToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/* ---------------- Request context helpers --------------- */
export function getAuthUser(request) {
  const header =
    request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  return verifyAuthToken(header.slice(7).trim());
}

export function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * Guard an endpoint. Returns { user, error }.
 * - error is a ready-to-return Response on failure.
 */
export function requireRole(request, roles = []) {
  const user = getAuthUser(request);
  if (!user) {
    return { user: null, error: jsonError("Authentication required. Please sign in.", 401) };
  }
  if (Array.isArray(roles) && roles.length > 0 && !roles.includes(user.role)) {
    return { user: null, error: jsonError("You do not have permission to perform this action.", 403) };
  }
  return { user, error: null };
}
