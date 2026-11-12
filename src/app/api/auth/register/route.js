import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, signAuthToken, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLES = ["PROFESSOR", "STUDENT"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* POST /api/auth/register */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const role = String(body?.role ?? "").trim().toUpperCase();

  if (!name || name.length < 2) return jsonError("Please enter your full name.", 400);
  if (!EMAIL_RE.test(email)) return jsonError("Please enter a valid email address.", 400);
  if (password.length < 6) return jsonError("Password must be at least 6 characters.", 400);
  if (!ROLES.includes(role)) return jsonError("Role must be PROFESSOR or STUDENT.", 400);

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) {
    return jsonError("An account with this email already exists.", 409);
  }

  const [created] = await db
    .insert(users)
    .values({ name, email, passwordHash: hashPassword(password), role })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });

  const token = signAuthToken(created);
  return Response.json(
    { token, role: created.role, name: created.name, email: created.email },
    { status: 201 }
  );
}
