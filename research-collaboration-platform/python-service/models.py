"""SQLAlchemy database models.

Exactly four application tables:
    users, projects, project_applications, tasks
"""

import enum

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


# ----------------------------------------------------------------------
# Enumerations (DB-native enums, stored as strings)
# ----------------------------------------------------------------------
class UserRole(str, enum.Enum):
    PROFESSOR = "PROFESSOR"
    STUDENT = "STUDENT"


class ApplicationStatus(str, enum.Enum):
    JOINED = "JOINED"
    PENDING = "PENDING"


class TaskStatus(str, enum.Enum):
    TO_DO = "TO_DO"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


# ----------------------------------------------------------------------
# users — identity, password hash, role
# ----------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole, name="user_role"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ----------------------------------------------------------------------
# projects — professor-owned research announcements
# ----------------------------------------------------------------------
class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(150), nullable=False)
    professor_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    professor = relationship("User")


# ----------------------------------------------------------------------
# project_applications — student join requests (JOINED / PENDING)
# ----------------------------------------------------------------------
class ProjectApplication(Base):
    __tablename__ = "project_applications"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "student_id", name="uq_application_project_student"
        ),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status = Column(
        SAEnum(ApplicationStatus, name="application_status"),
        nullable=False,
        default=ApplicationStatus.PENDING,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    project = relationship("Project")
    student = relationship("User")


# ----------------------------------------------------------------------
# tasks — assignments given to JOINED students
# ----------------------------------------------------------------------
class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "student_id", "title", name="uq_task_project_student_title"
        ),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(255), nullable=False)
    goal_description = Column(Text, nullable=False, default="")
    status = Column(
        SAEnum(TaskStatus, name="task_status"),
        nullable=False,
        default=TaskStatus.TO_DO,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    project = relationship("Project")
    student = relationship("User")
