from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.models import User, Conversation, Message, MEMBERSHIP_LEVELS
from app.schemas.user import UserCreate
from app.core.security import get_password_hash, verify_password


def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()


def create_user(db: Session, user_in: UserCreate):
    db_user = User(
        email=user_in.email,
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate(db: Session, *, username: str, password: str):
    """支持用用户名或邮箱登录"""
    user = get_user_by_username(db, username)
    if not user:
        user = get_user_by_email(db, username)
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def change_password(db: Session, user, old_password: str, new_password: str) -> bool:
    if not verify_password(old_password, user.password_hash):
        return False
    user.password_hash = get_password_hash(new_password)
    db.commit()
    return True


def set_password(db: Session, user, new_password: str) -> None:
    user.password_hash = get_password_hash(new_password)
    db.commit()


def get_user_total_questions(db: Session, user_id: int) -> int:
    """统计用户总提问数（AI 正常响应次数 = assistant 消息数）"""
    return (
        db.query(func.count(Message.id))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(
            Conversation.user_id == user_id,
            Message.role == "assistant",
        )
        .scalar()
    ) or 0


def update_user_membership_by_questions(db: Session, user: User) -> bool:
    """
    根据提问次数自动更新用户等级（只升不降，管理员手动设置的等级不会被降低）。
    阈值：10=青铜, 30=白银, 50=黄金, 100=钻石
    """
    total = get_user_total_questions(db, user.id)

    if total >= 100:
        new_level = "king"
    elif total >= 50:
        new_level = "diamond"
    elif total >= 30:
        new_level = "gold"
    elif total >= 10:
        new_level = "silver"
    elif total >= 1:
        new_level = "bronze"
    else:
        new_level = "free"

    current_idx = MEMBERSHIP_LEVELS.index(user.membership_level)
    new_idx = MEMBERSHIP_LEVELS.index(new_level)
    if new_idx > current_idx:
        user.membership_level = new_level
        db.commit()
        db.refresh(user)
        return True
    return False
