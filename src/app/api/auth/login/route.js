import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, signAuthToken, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* POST /api/auth/login */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!email || !password) return jsonError("Email and password are required.", 400);

  const rows = await db.select().from(users).where(eq(users.email, email));
  const user = rows[0];

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return jsonError("Invalid email or password.", 401);
  }

  const token = signAuthToken(user);
  return Response.json({ token, role: user.role, name: user.name, email: user.email });
}
