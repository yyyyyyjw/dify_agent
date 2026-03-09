from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class AdminFeedback(BaseModel):
    id: int
    rating: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AdminMessage(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
    feedback: Optional[AdminFeedback] = None

    class Config:
        from_attributes = True


class AdminConversation(BaseModel):
    id: int
    title: Optional[str]
    dify_conversation_id: Optional[str]
    created_at: datetime
    user_id: int
    username: str
    messages: List[AdminMessage]

    class Config:
        from_attributes = True


class ConvSummary(BaseModel):
    id: int
    dify_conversation_id: Optional[str]
    title: Optional[str]
    question_count: int


class UserDayQueryDetail(BaseModel):
    user_id: int
    username: str
    email: str
    membership_level: str
    question_count: int
    conversations: List[ConvSummary]


# ── 新增：GitHub 风格热力图 ───────────────────────────────────────

class UserHeatmapData(BaseModel):
    user_id: int
    username: str
    email: str
    membership_level: str
    created_at: datetime
    days: Dict[str, int]   # {"YYYY-MM-DD": question_count}


# ── 新增：总排行榜 ────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: str
    email: str
    membership_level: str
    total_questions: int
    created_at: datetime


# ── 新增：用户管理 ────────────────────────────────────────────────

class MembershipUpdateRequest(BaseModel):
    membership_level: str
