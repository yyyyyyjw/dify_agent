from sqlalchemy.orm import Session
from app.models.models import Conversation, Message
from app.schemas.chat import ConversationCreate, MessageCreate

def get_conversation(db: Session, conversation_id: int):
    return db.query(Conversation).filter(Conversation.id == conversation_id).first()

def get_user_conversations(db: Session, user_id: int):
    return db.query(Conversation).filter(Conversation.user_id == user_id).order_by(Conversation.created_at.desc()).all()

def create_conversation(db: Session, conversation_in: ConversationCreate):
    db_conversation = Conversation(
        user_id=conversation_in.user_id,
        title=conversation_in.title,
        dify_conversation_id=conversation_in.dify_conversation_id,
    )
    db.add(db_conversation)
    db.commit()
    db.refresh(db_conversation)
    return db_conversation

def create_message(db: Session, message_in: MessageCreate):
    db_message = Message(
        conversation_id=message_in.conversation_id,
        role=message_in.role,
        content=message_in.content,
        dify_message_id=message_in.dify_message_id
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return db_message

def update_conversation_dify_id(db: Session, conversation_id: int, dify_conversation_id: str):
    db_conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if db_conv:
        db_conv.dify_conversation_id = dify_conversation_id
        db.commit()
        db.refresh(db_conv)
    return db_conv

def update_message_dify_id(db: Session, message_id: int, dify_message_id: str):
    db_msg = db.query(Message).filter(Message.id == message_id).first()
    if db_msg and not db_msg.dify_message_id:
        db_msg.dify_message_id = dify_message_id
        db.commit()
        db.refresh(db_msg)
    return db_msg

def get_conversation_messages(db: Session, conversation_id: int):
    return db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at.asc()).all()
