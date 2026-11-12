import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["TO_DO", "IN_PROGRESS", "COMPLETED"];

/* PUT /api/tasks/:id/status — student moves a task across the board */
export async function PUT(request, context) {
  const { user, error } = requireRole(request, ["STUDENT"]);
  if (error) return error;

  const { id } = await context.params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) return jsonError("Invalid task id.", 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const status = String(body?.status ?? "").toUpperCase();
  if (!VALID_STATUSES.includes(status)) {
    return jsonError(`Status must be one of: ${VALID_STATUSES.join(", ")}.`, 400);
  }

  const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (rows.length === 0) return jsonError("Task not found.", 404);
  if (rows[0].studentId !== user.sub)
    return jsonError("You can only update your own tasks.", 403);

  const [updated] = await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning();

  return Response.json({ task: updated });
}
