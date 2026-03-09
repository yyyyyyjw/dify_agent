from sqlalchemy.orm import Session
from datetime import datetime, date
from app.models.models import Feedback, Message, Conversation
from app.schemas.feedback import FeedbackCreate

def create_feedback(db: Session, feedback_in: FeedbackCreate):
    # 如果已经存在评分，则更新
    db_feedback = db.query(Feedback).filter(Feedback.message_id == feedback_in.message_id).first()
    if db_feedback:
        db_feedback.rating = feedback_in.rating
        db_feedback.comment = feedback_in.comment
    else:
        db_feedback = Feedback(
            message_id=feedback_in.message_id,
            rating=feedback_in.rating,
            comment=feedback_in.comment
        )
        db.add(db_feedback)
    
    db.commit()
    db.refresh(db_feedback)
    return db_feedback

def get_feedback_by_message(db: Session, message_id: int):
    return db.query(Feedback).filter(Feedback.message_id == message_id).first()

def get_today_feedback_count(db: Session, user_id: int) -> int:
    today_start = datetime.combine(date.today(), datetime.min.time())
    return (
        db.query(Feedback)
        .join(Message, Feedback.message_id == Message.id)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(
            Conversation.user_id == user_id,
            Feedback.created_at >= today_start
        )
        .count()
    )
