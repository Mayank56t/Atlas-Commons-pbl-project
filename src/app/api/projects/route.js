import { db } from "@/db";
import { projects, users, projectApplications, tasks, PROJECT_CATEGORIES } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole, jsonError } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* GET /api/projects?category=... — list all announcements (any authenticated user) */
export async function GET(request) {
  const { user, error } = requireRole(request, []);
  if (error) return error;

  const url = new URL(request.url);
  const category = url.searchParams.get("category");

  let rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      description: projects.description,
      category: projects.category,
      professorId: projects.professorId,
      professorName: users.name,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .leftJoin(users, eq(projects.professorId, users.id))
    .orderBy(desc(projects.createdAt));

  if (category && category !== "All" && PROJECT_CATEGORIES.includes(category)) {
    rows = rows.filter((p) => p.category === category);
  }

  const applications = await db.select().from(projectApplications);
  const taskRows = await db.select({
    id: tasks.id,
    projectId: tasks.projectId,
    status: tasks.status,
  }).from(tasks);

  const data = rows.map((p) => {
    const apps = applications.filter((a) => a.projectId === p.id);
    const myApp = user.role === "STUDENT" ? apps.find((a) => a.studentId === user.sub) : null;
    return {
      ...p,
      joinedCount: apps.filter((a) => a.status === "JOINED").length,
      pendingCount: apps.filter((a) => a.status === "PENDING").length,
      taskCount: taskRows.filter((t) => t.projectId === p.id).length,
      myApplicationStatus: myApp ? myApp.status : null,
    };
  });

  return Response.json({ projects: data, categories: PROJECT_CATEGORIES });
}

/* POST /api/projects — publish a new announcement (professors only) */
export async function POST(request) {
  const { user, error } = requireRole(request, ["PROFESSOR"]);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const category = String(body?.category ?? "").trim();

  if (!title || title.length < 4) return jsonError("Please provide a title (min. 4 characters).", 400);
  if (!description || description.length < 10)
    return jsonError("Please provide a description (min. 10 characters).", 400);
  if (!PROJECT_CATEGORIES.includes(category))
    return jsonError(`Category must be one of: ${PROJECT_CATEGORIES.join(", ")}.`, 400);

  const [created] = await db
    .insert(projects)
    .values({ title, description, category, professorId: user.sub })
    .returning();

  return Response.json({ project: { ...created, professorName: user.name } }, { status: 201 });
}
