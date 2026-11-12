import { db } from "@/db";
import { projects, users, projectApplications, tasks } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* GET /api/tasks — students get their own tasks / professors get tasks they assigned */
export async function GET(request) {
  const { user, error } = requireRole(request, []);
  if (error) return error;

  if (user.role === "STUDENT") {
    const rows = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        goalDescription: tasks.goalDescription,
        status: tasks.status,
        updatedAt: tasks.updatedAt,
        projectTitle: projects.title,
        projectCategory: projects.category,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .where(eq(tasks.studentId, user.sub))
      .orderBy(desc(tasks.updatedAt));
    return Response.json({ tasks: rows });
  }

  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      goalDescription: tasks.goalDescription,
      status: tasks.status,
      updatedAt: tasks.updatedAt,
      projectTitle: projects.title,
      studentName: users.name,
      studentId: tasks.studentId,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(users, eq(tasks.studentId, users.id))
    .where(eq(projects.professorId, user.sub))
    .orderBy(desc(tasks.updatedAt));

  return Response.json({ tasks: rows });
}

/* POST /api/tasks — professor assigns a task to a JOINED student */
export async function POST(request) {
  const { user, error } = requireRole(request, ["PROFESSOR"]);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const projectId = Number(body?.projectId);
  const studentId = Number(body?.studentId);
  const title = String(body?.title ?? "").trim();
  const goalDescription = String(body?.goalDescription ?? "").trim();

  if (!Number.isInteger(projectId)) return jsonError("A valid projectId is required.", 400);
  if (!Number.isInteger(studentId)) return jsonError("A valid studentId is required.", 400);
  if (!title || title.length < 3) return jsonError("Task title must be at least 3 characters.", 400);

  const projectRows = await db.select().from(projects).where(eq(projects.id, projectId));
  if (projectRows.length === 0) return jsonError("Project not found.", 404);
  if (projectRows[0].professorId !== user.sub)
    return jsonError("You can only assign tasks within your own projects.", 403);

  const appRows = await db
    .select()
    .from(projectApplications)
    .where(
      and(
        eq(projectApplications.projectId, projectId),
        eq(projectApplications.studentId, studentId)
      )
    );

  if (appRows.length === 0 || appRows[0].status !== "JOINED") {
    return jsonError("Tasks can only be assigned to students who have joined the project.", 409);
  }

  try {
    const [created] = await db
      .insert(tasks)
      .values({ projectId, studentId, title, goalDescription, status: "TO_DO" })
      .returning();
    return Response.json({ task: created }, { status: 201 });
  } catch (e) {
    return jsonError("A task with this title already exists for this student.", 409);
  }
}
