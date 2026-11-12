import { db } from "@/db";
import { projects, users, projectApplications, tasks } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * GET /api/projects/mine — professor dashboard aggregate.
 * The professor's projects, each with its applications (student info)
 * and assigned tasks (student info).
 */
export async function GET(request) {
  const { user, error } = requireRole(request, ["PROFESSOR"]);
  if (error) return error;

  const myProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.professorId, user.sub))
    .orderBy(desc(projects.createdAt));

  const projectIds = myProjects.map((p) => p.id);
  let applications = [];
  let taskRows = [];

  if (projectIds.length > 0) {
    applications = await db
      .select({
        id: projectApplications.id,
        projectId: projectApplications.projectId,
        studentId: projectApplications.studentId,
        status: projectApplications.status,
        createdAt: projectApplications.createdAt,
        studentName: users.name,
        studentEmail: users.email,
      })
      .from(projectApplications)
      .leftJoin(users, eq(projectApplications.studentId, users.id))
      .where(inArray(projectApplications.projectId, projectIds));

    taskRows = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        studentId: tasks.studentId,
        title: tasks.title,
        goalDescription: tasks.goalDescription,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
        studentName: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.studentId, users.id))
      .where(inArray(tasks.projectId, projectIds));
  }

  const data = myProjects.map((p) => ({
    ...p,
    applications: applications.filter((a) => a.projectId === p.id),
    tasks: taskRows.filter((t) => t.projectId === p.id),
  }));

  return Response.json({ projects: data });
}
