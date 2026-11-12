"""Research Collaboration Platform — FastAPI primary backend.

Everything lives here, by design:
  * FastAPI application + CORS (frontend origin only)
  * Pydantic request schemas
  * Authentication (HS256 JWT creation & verification, expiry checked)
  * Role-based authorization (PROFESSOR / STUDENT)
  * Business rules & all endpoint implementations
  * SQLAlchemy database operations
  * Uniform error handling: { "error": "..." }
"""

import datetime as dt
import os
import re
from contextlib import asynccontextmanager
from typing import Annotated, Optional

import bcrypt
import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from database import Base, engine, get_db
from models import (
    ApplicationStatus,
    Project,
    ProjectApplication,
    Task,
    TaskStatus,
    User,
    UserRole,
)

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
JWT_SECRET = os.getenv(
    "JWT_SECRET", "change-me-in-production-research-platform-secret"
)
JWT_EXPIRATION = int(os.getenv("JWT_EXPIRATION", "86400000"))  # milliseconds (24h)
JWT_ALGORITHM = "HS256"

# The frontend is packaged and served by Spring Boot on port 8081.
# Both loopback names are listed because browsers treat them as distinct origins.
FRONTEND_ORIGINS = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
]

PROJECT_CATEGORIES = [
    "Environment Research",
    "AI Understandability",
    "Different Workspaces",
]

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# ----------------------------------------------------------------------
# Application setup
# ----------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the four application tables if they do not exist yet.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Research Collaboration Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# ----------------------------------------------------------------------
# Pydantic request schemas (minimum necessary, defined in main.py)
# ----------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=72)
    role: UserRole


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=72)


class ProjectIn(BaseModel):
    title: str = Field(min_length=4, max_length=255)
    description: str = Field(min_length=10)
    category: str = Field(min_length=1, max_length=150)


class StatusUpdateIn(BaseModel):
    status: ApplicationStatus


class TaskIn(BaseModel):
    projectId: int
    studentId: int
    title: str = Field(min_length=3, max_length=255)
    goalDescription: Optional[str] = ""


class TaskStatusIn(BaseModel):
    status: TaskStatus


# ----------------------------------------------------------------------
# Uniform error shape: { "error": "..." }
# ----------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code, content={"error": str(exc.detail)}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    message = "Invalid request."
    errors = exc.errors()
    if errors:
        first = errors[0]
        message = str(first.get("msg") or message)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": message},
    )


# ----------------------------------------------------------------------
# Password hashing (bcrypt) — plaintext is never stored
# ----------------------------------------------------------------------
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ----------------------------------------------------------------------
# JWT helpers — HS256, with expiration validation
# ----------------------------------------------------------------------
def create_token(user: User) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "iat": now,
        "exp": now + dt.timedelta(milliseconds=JWT_EXPIRATION),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


Db = Annotated[Session, Depends(get_db)]


def get_current_user(
    db: Db,
    authorization: Annotated[Optional[str], Header()] = None,
) -> User:
    """Verify the Bearer token and load the *actual* user from the database.

    Identity and role always come from the verified token + the database
    record — never from request bodies.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    token = authorization[len("Bearer "):].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found."
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(role: UserRole):
    def dependency(user: CurrentUser) -> User:
        if user.role != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return user

    return dependency


ProfessorUser = Annotated[User, Depends(require_role(UserRole.PROFESSOR))]
StudentUser = Annotated[User, Depends(require_role(UserRole.STUDENT))]


# ----------------------------------------------------------------------
# Serializers
# ----------------------------------------------------------------------
def auth_payload(user: User) -> dict:
    return {
        "token": create_token(user),
        "role": user.role.value,
        "name": user.name,
        "email": user.email,
    }


def application_result(a: ProjectApplication) -> dict:
    return {
        "id": a.id,
        "projectId": a.project_id,
        "studentId": a.student_id,
        "status": a.status.value,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
    }


def task_item(t: Task) -> dict:
    return {
        "id": t.id,
        "projectId": t.project_id,
        "studentId": t.student_id,
        "title": t.title,
        "goalDescription": t.goal_description,
        "status": t.status.value,
    }


# ======================================================================
#  HEALTH + AUTHENTICATION
# ======================================================================
@app.get("/api/health")
def health(db: Db):
    db.execute(text("SELECT 1"))
    return {"ok": True}


@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterIn, db: Db):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid email address.",
        )

    if db.query(User).filter(User.email == email).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        name=body.name.strip(),
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return auth_payload(user)


@app.post("/api/auth/login")
def login(body: LoginIn, db: Db):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return auth_payload(user)


# ======================================================================
#  PROJECTS
# ======================================================================
@app.get("/api/projects")
def list_projects(
    db: Db,
    user: CurrentUser,
    category: Optional[str] = None,
):
    query = db.query(Project).options(joinedload(Project.professor))
    if category and category != "All" and category in PROJECT_CATEGORIES:
        query = query.filter(Project.category == category)
    projects = query.order_by(Project.created_at.desc()).all()

    ids = [p.id for p in projects]
    applications = (
        db.query(ProjectApplication).filter(ProjectApplication.project_id.in_(ids)).all()
        if ids
        else []
    )
    count_rows = (
        db.query(Task.project_id, func.count(Task.id))
        .filter(Task.project_id.in_(ids))
        .group_by(Task.project_id)
        .all()
        if ids
        else []
    )
    task_counts = {row[0]: row[1] for row in count_rows}

    student_id = user.id if user.role == UserRole.STUDENT else None

    result = []
    for p in projects:
        project_apps = [a for a in applications if a.project_id == p.id]
        joined = sum(1 for a in project_apps if a.status == ApplicationStatus.JOINED)
        pending = sum(1 for a in project_apps if a.status == ApplicationStatus.PENDING)
        my_status = None
        if student_id is not None:
            for a in project_apps:
                if a.student_id == student_id:
                    my_status = a.status.value
                    break

        result.append(
            {
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "category": p.category,
                "professorId": p.professor_id,
                "professorName": p.professor.name if p.professor else None,
                "createdAt": p.created_at.isoformat() if p.created_at else None,
                "joinedCount": joined,
                "pendingCount": pending,
                "taskCount": int(task_counts.get(p.id, 0)),
                "myApplicationStatus": my_status,
            }
        )

    return {"projects": result, "categories": PROJECT_CATEGORIES}


@app.post("/api/projects", status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectIn, db: Db, professor: ProfessorUser):
    if body.category.strip() not in PROJECT_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category must be one of: " + ", ".join(PROJECT_CATEGORIES) + ".",
        )

    project = Project(
        title=body.title.strip(),
        description=body.description.strip(),
        category=body.category.strip(),
        professor_id=professor.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    return {
        "project": {
            "id": project.id,
            "title": project.title,
            "description": project.description,
            "category": project.category,
            "professorId": professor.id,
            "professorName": professor.name,
            "createdAt": project.created_at.isoformat() if project.created_at else None,
            "joinedCount": 0,
            "pendingCount": 0,
            "taskCount": 0,
            "myApplicationStatus": None,
        }
    }


@app.get("/api/projects/mine")
def my_projects(db: Db, professor: ProfessorUser):
    projects = (
        db.query(Project)
        .filter(Project.professor_id == professor.id)
        .order_by(Project.created_at.desc())
        .all()
    )

    ids = [p.id for p in projects]
    applications = (
        db.query(ProjectApplication)
        .options(joinedload(ProjectApplication.student))
        .filter(ProjectApplication.project_id.in_(ids))
        .all()
        if ids
        else []
    )
    tasks = (
        db.query(Task)
        .options(joinedload(Task.student))
        .filter(Task.project_id.in_(ids))
        .all()
        if ids
        else []
    )

    result = []
    for p in projects:
        app_items = [
            {
                "id": a.id,
                "projectId": a.project_id,
                "studentId": a.student_id,
                "status": a.status.value,
                "createdAt": a.created_at.isoformat() if a.created_at else None,
                "studentName": a.student.name if a.student else None,
                "studentEmail": a.student.email if a.student else None,
            }
            for a in applications
            if a.project_id == p.id
        ]
        task_items = [
            {
                "id": t.id,
                "projectId": t.project_id,
                "studentId": t.student_id,
                "title": t.title,
                "goalDescription": t.goal_description,
                "status": t.status.value,
                "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
                "studentName": t.student.name if t.student else None,
            }
            for t in tasks
            if t.project_id == p.id
        ]
        result.append(
            {
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "category": p.category,
                "professorId": p.professor_id,
                "createdAt": p.created_at.isoformat() if p.created_at else None,
                "applications": app_items,
                "tasks": task_items,
            }
        )

    return {"projects": result}


@app.post("/api/projects/{project_id}/join", status_code=status.HTTP_201_CREATED)
def join_project(project_id: int, db: Db, student: StudentUser):
    if db.get(Project, project_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found."
        )

    existing = (
        db.query(ProjectApplication)
        .filter(
            ProjectApplication.project_id == project_id,
            ProjectApplication.student_id == student.id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You already joined this project."
                if existing.status == ApplicationStatus.JOINED
                else "You already applied to this project."
            ),
        )

    application = ProjectApplication(
        project_id=project_id,
        student_id=student.id,
        status=ApplicationStatus.PENDING,
    )
    db.add(application)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already applied to this project.",
        )
    db.refresh(application)

    return {
        "application": application_result(application),
        "message": "Join request sent to the professor.",
    }


# ======================================================================
#  APPLICATIONS (professor approves / declines)
# ======================================================================
def require_owned_application(
    db: Session, application_id: int, professor: User
) -> ProjectApplication:
    application = (
        db.query(ProjectApplication)
        .options(joinedload(ProjectApplication.project), joinedload(ProjectApplication.student))
        .filter(ProjectApplication.id == application_id)
        .first()
    )
    if application is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found."
        )
    if application.project.professor_id != professor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage applications to your own projects.",
        )
    return application


@app.put("/api/applications/{application_id}")
def update_application_status(
    application_id: int, body: StatusUpdateIn, db: Db, professor: ProfessorUser
):
    application = require_owned_application(db, application_id, professor)
    application.status = body.status
    db.commit()
    db.refresh(application)
    return {"application": application_result(application)}


@app.delete("/api/applications/{application_id}")
def delete_application(application_id: int, db: Db, professor: ProfessorUser):
    application = require_owned_application(db, application_id, professor)
    project_id = application.project_id
    student_id = application.student_id

    db.query(Task).filter(
        Task.project_id == project_id, Task.student_id == student_id
    ).delete(synchronize_session=False)
    db.delete(application)
    db.commit()
    return {"ok": True}


# ======================================================================
#  TASKS
# ======================================================================
@app.get("/api/tasks")
def list_tasks(db: Db, user: CurrentUser):
    if user.role == UserRole.STUDENT:
        rows = (
            db.query(Task)
            .options(joinedload(Task.project))
            .filter(Task.student_id == user.id)
            .order_by(Task.updated_at.desc())
            .all()
        )
        return {
            "tasks": [
                {
                    "id": t.id,
                    "projectId": t.project_id,
                    "title": t.title,
                    "goalDescription": t.goal_description,
                    "status": t.status.value,
                    "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
                    "projectTitle": t.project.title if t.project else None,
                    "projectCategory": t.project.category if t.project else None,
                }
                for t in rows
            ]
        }

    # Professor: only tasks belonging to their own projects.
    owned_ids = [
        row[0]
        for row in db.query(Project.id).filter(Project.professor_id == user.id).all()
    ]
    rows = (
        db.query(Task)
        .options(joinedload(Task.project), joinedload(Task.student))
        .filter(Task.project_id.in_(owned_ids))
        .order_by(Task.updated_at.desc())
        .all()
        if owned_ids
        else []
    )
    return {
        "tasks": [
            {
                "id": t.id,
                "projectId": t.project_id,
                "title": t.title,
                "goalDescription": t.goal_description,
                "status": t.status.value,
                "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
                "projectTitle": t.project.title if t.project else None,
                "studentName": t.student.name if t.student else None,
                "studentId": t.student_id,
            }
            for t in rows
        ]
    }


@app.post("/api/tasks", status_code=status.HTTP_201_CREATED)
def create_task(body: TaskIn, db: Db, professor: ProfessorUser):
    project = db.get(Project, body.projectId)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found."
        )
    if project.professor_id != professor.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only assign tasks within your own projects.",
        )

    if db.get(User, body.studentId) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Student not found."
        )

    application = (
        db.query(ProjectApplication)
        .filter(
            ProjectApplication.project_id == project.id,
            ProjectApplication.student_id == body.studentId,
        )
        .first()
    )
    if application is None or application.status != ApplicationStatus.JOINED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tasks can only be assigned to students who have joined the project.",
        )

    task = Task(
        project_id=project.id,
        student_id=body.studentId,
        title=body.title.strip(),
        goal_description=(body.goalDescription or "").strip(),
        status=TaskStatus.TO_DO,
    )
    db.add(task)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A task with this title already exists for this student.",
        )
    db.refresh(task)
    return {"task": task_item(task)}


@app.put("/api/tasks/{task_id}/status")
def update_task_status(
    task_id: int, body: TaskStatusIn, db: Db, student: StudentUser
):
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found."
        )
    if task.student_id != student.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own tasks.",
        )

    task.status = body.status  # TaskStatus enum — validated: TO_DO / IN_PROGRESS / COMPLETED
    task.updated_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(task)
    return {"task": task_item(task)}
