from pydantic import BaseModel, ConfigDict, field_serializer, field_validator

from datetime import datetime

REQ_TYPES = {"functional", "non-functional", "constraint"}
PRIORITIES = {"high", "medium", "low"}


def iso_utc(dt: datetime) -> str:
    """SQLite хранит naive UTC — фронт должен парсить дату как UTC, а не как local."""
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")


class SourceOut(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    text: str | None = None


class UserStoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    role: str
    action: str
    goal: str


class RequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    public_id: str
    type: str
    title: str
    description: str
    priority: str
    confidence: float
    needs_clarification: bool
    manual: bool
    for_roles: str = "ALL"
    source: SourceOut | None = None
    user_stories: list[UserStoryOut] = []


class RequirementPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    type: str | None = None
    needs_clarification: bool | None = None

    @field_validator("priority")
    @classmethod
    def _prio(cls, v):
        if v is not None and v not in PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(PRIORITIES)}")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v is not None and v not in REQ_TYPES:
            raise ValueError(f"type must be one of {sorted(REQ_TYPES)}")
        return v

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if v is not None and not (1 <= len(v.strip()) <= 300):
            raise ValueError("title must be 1-300 chars")
        return v


class RequirementCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    type: str = "functional"

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        v = v.strip()
        if not (1 <= len(v) <= 300):
            raise ValueError("title must be 1-300 chars")
        return v

    @field_validator("priority")
    @classmethod
    def _prio(cls, v):
        if v not in PRIORITIES:
            raise ValueError(f"priority must be one of {sorted(PRIORITIES)}")
        return v

    @field_validator("type")
    @classmethod
    def _type(cls, v):
        if v not in REQ_TYPES:
            raise ValueError(f"type must be one of {sorted(REQ_TYPES)}")
        return v


class SegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    start_sec: float
    end_sec: float
    speaker: str | None
    text: str


class OpenQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    source_text: str | None
    resolved: bool
    requirement_id: str | None = None
    requirement_public_id: str | None = None


class ContradictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    requirement_public_ids: str
    description: str
    recommendation: str
    resolved: bool = False


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str = ""
    status: str
    duration_sec: float | None
    summary: str | None = None
    error: str | None
    created_at: datetime
    is_video: bool = False
    project_id: str | None = None
    project_name: str | None = None
    project_role: str | None = None

    @field_serializer("created_at")
    def _ser_created(self, v: datetime) -> str:
        return iso_utc(v)


class ProjectIn(BaseModel):
    name: str
    description: str = ""

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not (2 <= len(v) <= 200):
            raise ValueError("Название проекта: 2–200 символов")
        return v


class ProjectPatch(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str = ""
    created_at: datetime
    updated_at: datetime
    meetings_count: int = 0
    last_meeting_at: datetime | None = None
    status: str = "empty"
    my_role: str = "viewer"
    owner_name: str | None = None

    @field_serializer("created_at", "updated_at", "last_meeting_at")
    def _ser_dt(self, v: datetime | None) -> str | None:
        return iso_utc(v) if v else None


class QuestionCreate(BaseModel):
    description: str

    @field_validator("description")
    @classmethod
    def _desc(cls, v):
        if not (3 <= len(v.strip()) <= 2000):
            raise ValueError("вопрос 3-2000 символов")
        return v.strip()


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    description: str
    requirement_id: str | None


class MeetingDetail(BaseModel):
    meeting: MeetingOut
    requirements: list[RequirementOut]
    roles: list[str]
    constraints: list[RequirementOut]
    open_questions: list[OpenQuestionOut]
    contradictions: list[ContradictionOut]
    counts: dict[str, int] = {}


# ---------------- auth ----------------
class UserOut(BaseModel):
    id: str
    email: str
    name: str
    system_role: str = "user"


class MemberIn(BaseModel):
    email: str
    role: str = "viewer"

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        if v not in {"editor", "viewer"}:
            raise ValueError("role: editor|viewer (владелец проекта назначается при создании)")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        return v.strip().lower()


class MemberOut(BaseModel):
    id: str
    user_id: str
    name: str
    email: str
    role: str
    created_at: datetime

    @field_serializer("created_at")
    def _ser_created(self, v: datetime) -> str:
        return iso_utc(v)


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str
    password_confirm: str

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not (2 <= len(v) <= 100):
            raise ValueError("Имя: 2–100 символов")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = v.strip().lower()
        import re
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]{2,}", v):
            raise ValueError("Некорректный email")
        return v

    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if len(v) < 8:
            raise ValueError("Пароль: минимум 8 символов")
        if len(v.encode("utf-8")) > 128:
            raise ValueError("Пароль: максимум 128 символов")
        return v


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        return v.strip().lower()


class NamePatch(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = v.strip()
        if not (2 <= len(v) <= 100):
            raise ValueError("Имя: 2–100 символов")
        return v
