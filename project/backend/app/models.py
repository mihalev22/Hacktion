import uuid
from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, Text, DateTime, Float, Boolean, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    name: Mapped[str] = mapped_column(String(100))
    system_role: Mapped[str] = mapped_column(String(10), default="user")  # admin | user (≠ AI-роли, ≠ project access)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)        # False = blocked
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    meetings: Mapped[list["Meeting"]] = relationship(back_populates="user")
    projects: Mapped[list["Project"]] = relationship(back_populates="owner")


class ProjectMember(Base):
    """Доступ к проекту: owner | editor | viewer."""
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_user"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10), default="viewer")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    owner: Mapped["User | None"] = relationship(back_populates="projects")
    meetings: Mapped[list["Meeting"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    members: Mapped[list["ProjectMember"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="Встреча")
    description: Mapped[str] = mapped_column(Text, default="")
    file_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    file_path: Mapped[str | None] = mapped_column(String(500))  # храним аудио: нужен плеер на экране
    s2t_task_id: Mapped[str | None] = mapped_column(String(64))
    duration_sec: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[str | None] = mapped_column(Text)  # выжимка от ИИ
    # uploaded | transcribing | analyzing | done | error
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped["User | None"] = relationship(back_populates="meetings")
    project: Mapped["Project | None"] = relationship(back_populates="meetings")
    segments: Mapped[list["TranscriptSegment"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    requirements: Mapped[list["Requirement"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    open_questions: Mapped[list["OpenQuestion"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")
    contradictions: Mapped[list["Contradiction"]] = relationship(back_populates="meeting", cascade="all, delete-orphan")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    start_sec: Mapped[float] = mapped_column(Float)
    end_sec: Mapped[float] = mapped_column(Float)
    speaker: Mapped[str | None] = mapped_column(String(50))
    text: Mapped[str] = mapped_column(Text)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    public_id: Mapped[str] = mapped_column(String(20), default=_uuid)  # REQ-001
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20), default="functional")  # functional|non-functional|constraint
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(10), default="medium")  # high|medium|low
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    needs_clarification: Mapped[bool] = mapped_column(Boolean, default=False)
    source_text: Mapped[str | None] = mapped_column(Text)
    source_start_sec: Mapped[float | None] = mapped_column(Float)
    source_end_sec: Mapped[float | None] = mapped_column(Float)
    source_segment_id: Mapped[str | None] = mapped_column(ForeignKey("transcript_segments.id", ondelete="SET NULL"))
    for_roles: Mapped[str] = mapped_column(String(200), default="ALL")  # "ALL" или "Менеджер, Экспедитор"
    manual: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="requirements")
    user_stories: Mapped[list["UserStory"]] = relationship(back_populates="requirement", cascade="all, delete-orphan")


class UserStory(Base):
    __tablename__ = "user_stories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(300))
    goal: Mapped[str] = mapped_column(String(300))

    requirement: Mapped[Requirement] = relationship(back_populates="user_stories")


class OpenQuestion(Base):
    __tablename__ = "open_questions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    requirement_id: Mapped[str | None] = mapped_column(ForeignKey("requirements.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(Text)
    source_text: Mapped[str | None] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="open_questions")


class Contradiction(Base):
    __tablename__ = "contradictions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    meeting_id: Mapped[str] = mapped_column(ForeignKey("meetings.id", ondelete="CASCADE"))
    requirement_public_ids: Mapped[str] = mapped_column(String(200))  # "REQ-002,REQ-005"
    description: Mapped[str] = mapped_column(Text)
    recommendation: Mapped[str] = mapped_column(Text, default="")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="contradictions")
