from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from app.db.session import get_db
from app.api.auth import get_current_user
from app.models.models import User, Message, Conversation
from app.schemas.feedback import Feedback, FeedbackCreate
from app.crud import feedback as feedback_crud
from app.crud import chat as chat_crud

router = APIRouter()

@router.post("", response_model=Feedback)
def create_message_feedback(
    feedback_in: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    为特定消息提交评分和评价
    """
    # 1. 验证消息是否存在
    db_message = db.query(Message).filter(Message.id == feedback_in.message_id).first()
    if not db_message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # 2. 验证该消息是否属于当前用户
    db_conv = chat_crud.get_conversation(db, conversation_id=db_message.conversation_id)
    if not db_conv or db_conv.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to rate this message")
    
    # 3. 验证是否为 AI 的回答（通常只对 AI 回答评分）
    if db_message.role != "assistant":
        raise HTTPException(status_code=400, detail="Can only rate assistant messages")

    return feedback_crud.create_feedback(db, feedback_in=feedback_in)


@router.get("/{message_id}", response_model=Optional[Feedback])
def get_message_feedback(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    获取单条消息的评分信息
    """
    db_message = db.query(Message).filter(Message.id == message_id).first()
    if not db_message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    db_conv = chat_crud.get_conversation(db, conversation_id=db_message.conversation_id)
    if not db_conv or db_conv.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    return feedback_crud.get_feedback_by_message(db, message_id=message_id)
