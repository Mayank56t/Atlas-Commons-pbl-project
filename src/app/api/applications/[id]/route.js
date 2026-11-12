import { db } from "@/db";
import { projects, projectApplications, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getOwnedApplication(applicationId, professorId) {
  const rows = await db
    .select({
      application: projectApplications,
      projectProfessorId: projects.professorId,
    })
    .from(projectApplications)
    .leftJoin(projects, eq(projectApplications.projectId, projects.id))
    .where(eq(projectApplications.id, applicationId));

  if (rows.length === 0) return { notFound: true };
  if (rows[0].projectProfessorId !== professorId) return { notOwned: true };
  return { application: rows[0].application };
}

/* PUT /api/applications/:id — professor updates status (e.g. approve -> JOINED) */
export async function PUT(request, context) {
  const { user, error } = requireRole(request, ["PROFESSOR"]);
  if (error) return error;

  const { id } = await context.params;
  const applicationId = Number(id);
  if (!Number.isInteger(applicationId)) return jsonError("Invalid application id.", 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }
  const status = String(body?.status ?? "").toUpperCase();
  if (!["JOINED", "PENDING"].includes(status)) {
    return jsonError("Status must be JOINED or PENDING.", 400);
  }

  const result = await getOwnedApplication(applicationId, user.sub);
  if (result.notFound) return jsonError("Application not found.", 404);
  if (result.notOwned) return jsonError("You can only manage applications to your own projects.", 403);

  const [updated] = await db
    .update(projectApplications)
    .set({ status })
    .where(eq(projectApplications.id, applicationId))
    .returning();

  return Response.json({ application: updated });
}

/* DELETE /api/applications/:id — professor declines / removes a student */
export async function DELETE(request, context) {
  const { user, error } = requireRole(request, ["PROFESSOR"]);
  if (error) return error;

  const { id } = await context.params;
  const applicationId = Number(id);
  if (!Number.isInteger(applicationId)) return jsonError("Invalid application id.", 400);

  const result = await getOwnedApplication(applicationId, user.sub);
  if (result.notFound) return jsonError("Application not found.", 404);
  if (result.notOwned) return jsonError("You can only manage applications to your own projects.", 403);

  const { projectId, studentId } = result.application;

  await db
    .delete(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.studentId, studentId)));
  await db.delete(projectApplications).where(eq(projectApplications.id, applicationId));

  return Response.json({ ok: true });
}
