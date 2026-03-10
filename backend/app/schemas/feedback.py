from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class FeedbackBase(BaseModel):
    rating: int = Field(..., ge=1, le=10, description="评分，1-10分")
    comment: Optional[str] = Field(None, description="用户评价内容")

class FeedbackCreate(FeedbackBase):
    message_id: int

class Feedback(FeedbackBase):
    id: int
    message_id: int
    created_at: datetime

    class Config:
        from_attributes = True
