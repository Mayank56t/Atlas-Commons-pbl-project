import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */
export const userRole = pgEnum("user_role", ["PROFESSOR", "STUDENT"]);
export const applicationStatus = pgEnum("application_status", ["JOINED", "PENDING"]);
export const taskStatus = pgEnum("task_status", ["TO_DO", "IN_PROGRESS", "COMPLETED"]);

/* ------------------------------------------------------------------ */
/*  Allowed research categories                                        */
/* ------------------------------------------------------------------ */
export const PROJECT_CATEGORIES = [
  "Environment Research",
  "AI Understandability",
  "Different Workspaces",
];

/* ------------------------------------------------------------------ */
/*  User Entity — id, name, email, password, role                      */
/* ------------------------------------------------------------------ */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  Project Entity — id, title, description, category, professor       */
/* ------------------------------------------------------------------ */
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  professorId: integer("professor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/*  ProjectApplication Entity — id, project, student, status           */
/* ------------------------------------------------------------------ */
export const projectApplications = pgTable(
  "project_applications",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: applicationStatus("status").notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_applications_project_student_unique").on(
      table.projectId,
      table.studentId
    ),
  ]
);

/* ------------------------------------------------------------------ */
/*  Task Entity — id, project, student, title, goalDescription, status */
/* ------------------------------------------------------------------ */
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    goalDescription: text("goal_description").notNull().default(""),
    status: taskStatus("status").notNull().default("TO_DO"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tasks_project_student_title_unique").on(table.projectId, table.studentId, table.title)]
);
