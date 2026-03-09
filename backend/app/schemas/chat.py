from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.schemas.feedback import Feedback

# Message schemas
class MessageBase(BaseModel):
    role: str
    content: str

class MessageCreate(MessageBase):
    conversation_id: int
    dify_message_id: Optional[str] = None

class Message(MessageBase):
    id: int
    conversation_id: int
    dify_message_id: Optional[str] = None
    created_at: datetime
    feedback: Optional[Feedback] = None

    class Config:
        from_attributes = True

# Conversation schemas
class ConversationBase(BaseModel):
    title: Optional[str] = "New Chat"

class ConversationCreate(ConversationBase):
    user_id: int
    dify_conversation_id: Optional[str] = None

class Conversation(ConversationBase):
    id: int
    user_id: int
    dify_conversation_id: Optional[str] = None
    created_at: datetime
    messages: List[Message] = []

    class Config:
        from_attributes = True

# Chat Request schema
class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[int] = None
    inputs: Dict[str, Any] = {}
