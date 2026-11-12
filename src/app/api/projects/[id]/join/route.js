import { db } from "@/db";
import { projects, projectApplications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* POST /api/projects/:id/join — students request to join a project */
export async function POST(request, context) {
  const { user, error } = requireRole(request, ["STUDENT"]);
  if (error) return error;

  const { id } = await context.params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) return jsonError("Invalid project id.", 400);

  const projectRows = await db.select().from(projects).where(eq(projects.id, projectId));
  if (projectRows.length === 0) return jsonError("Project not found.", 404);

  const existing = await db
    .select()
    .from(projectApplications)
    .where(
      and(
        eq(projectApplications.projectId, projectId),
        eq(projectApplications.studentId, user.sub)
      )
    );

  if (existing.length > 0) {
    return jsonError(`You already ${existing[0].status === "JOINED" ? "joined" : "applied to"} this project.`, 409);
  }

  const [application] = await db
    .insert(projectApplications)
    .values({ projectId, studentId: user.sub, status: "PENDING" })
    .returning();

  return Response.json({ application, message: "Join request sent to the professor." }, { status: 201 });
}
