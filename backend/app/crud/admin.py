from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, date
from calendar import monthrange
from typing import Optional, List
from app.models.models import User, Conversation, Message, Feedback


def get_all_conversations_with_messages(
    db: Session,
    min_rating: Optional[int] = None,
    max_rating: Optional[int] = None,
) -> List[Conversation]:
    """
    获取所有对话（含消息和 feedback）。
    若指定了评分过滤，则只返回包含至少一条符合评分条件的 assistant 消息所在的对话。
    """
    query = (
        db.query(Conversation)
        .options(
            joinedload(Conversation.user),
            joinedload(Conversation.messages).joinedload(Message.feedback),
        )
    )

    if min_rating is not None or max_rating is not None:
        feedback_query = (
            db.query(Message.conversation_id)
            .join(Feedback, Message.id == Feedback.message_id)
        )
        if min_rating is not None:
            feedback_query = feedback_query.filter(Feedback.rating >= min_rating)
        if max_rating is not None:
            feedback_query = feedback_query.filter(Feedback.rating <= max_rating)

        eligible_conv_ids = [row[0] for row in feedback_query.distinct().all()]
        if not eligible_conv_ids:
            return []
        query = query.filter(Conversation.id.in_(eligible_conv_ids))

    return query.order_by(Conversation.created_at.desc()).all()


def get_all_users_daily_query_detail(db: Session, target_date: Optional[date] = None) -> List[dict]:
    """
    获取所有用户在指定日期的提问次数（AI 正常响应 = assistant 消息数）
    以及当天涉及的会话列表（id、dify_conversation_id、title、该天消息数）。
    """
    if target_date is None:
        target_date = date.today()

    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())

    users = (
        db.query(User)
        .filter(User.is_admin == False)  # noqa: E712
        .order_by(User.created_at.asc())
        .all()
    )

    # 一次聚合：当天 assistant 消息，按 user_id + conversation_id 分组
    rows = (
        db.query(
            Conversation.user_id,
            Conversation.id.label("conv_id"),
            Conversation.dify_conversation_id,
            Conversation.title,
            func.count(Message.id).label("msg_count"),
        )
        .join(Message, Message.conversation_id == Conversation.id)
        .filter(
            Message.role == "assistant",
            Message.created_at >= day_start,
            Message.created_at <= day_end,
        )
        .group_by(Conversation.user_id, Conversation.id, Conversation.dify_conversation_id, Conversation.title)
        .all()
    )

    # 构建 {user_id: [conv_info, ...]}
    conv_lookup: dict = {}
    for row in rows:
        uid = row.user_id
        if uid not in conv_lookup:
            conv_lookup[uid] = []
        conv_lookup[uid].append({
            "id": row.conv_id,
            "dify_conversation_id": row.dify_conversation_id,
            "title": row.title,
            "question_count": row.msg_count,
        })

    result = []
    for user in users:
        convs = conv_lookup.get(user.id, [])
        total = sum(c["question_count"] for c in convs)
        result.append({
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "membership_level": user.membership_level,
            "question_count": total,
            "conversations": convs,
        })

    return result


# ── 新增：GitHub 风格热力图（按月） ──────────────────────────────────

def get_all_users_monthly_heatmap(db: Session, year: int, month: int) -> List[dict]:
    """
    获取所有用户在指定月份每天的提问数（assistant 消息数），用于热力图。
    返回 [{user_id, username, email, membership_level, created_at, days: {"YYYY-MM-DD": count}}]
    """
    _, days_in_month = monthrange(year, month)
    month_start = datetime(year, month, 1)
    month_end = datetime(year, month, days_in_month, 23, 59, 59, 999999)

    users = (
        db.query(User)
        .filter(User.is_admin == False)  # noqa: E712
        .order_by(User.created_at.asc())
        .all()
    )

    rows = (
        db.query(
            Conversation.user_id,
            func.date(Message.created_at).label("msg_date"),
            func.count(Message.id).label("cnt"),
        )
        .join(Message, Message.conversation_id == Conversation.id)
        .filter(
            Message.role == "assistant",
            Message.created_at >= month_start,
            Message.created_at <= month_end,
        )
        .group_by(Conversation.user_id, func.date(Message.created_at))
        .all()
    )

    lookup: dict = {}
    for row in rows:
        uid = row.user_id
        d_str = str(row.msg_date)
        if uid not in lookup:
            lookup[uid] = {}
        lookup[uid][d_str] = row.cnt

    result = []
    for user in users:
        days_data: dict = {}
        for day_num in range(1, days_in_month + 1):
            d = date(year, month, day_num)
            d_str = d.strftime("%Y-%m-%d")
            days_data[d_str] = lookup.get(user.id, {}).get(d_str, 0)

        result.append({
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "membership_level": user.membership_level,
            "created_at": user.created_at,
            "days": days_data,
        })

    return result


# ── 新增：总排行榜 ────────────────────────────────────────────────────

def get_leaderboard(db: Session) -> List[dict]:
    """
    获取所有用户的总提问数（assistant 消息总数），按提问数降序排列。
    """
    users = (
        db.query(User)
        .filter(User.is_admin == False)  # noqa: E712
        .all()
    )

    # 聚合：每个 user_id 的 assistant 消息总数
    rows = (
        db.query(
            Conversation.user_id,
            func.count(Message.id).label("total"),
        )
        .join(Message, Message.conversation_id == Conversation.id)
        .filter(Message.role == "assistant")
        .group_by(Conversation.user_id)
        .all()
    )

    count_map = {row.user_id: row.total for row in rows}

    entries = []
    for user in users:
        entries.append({
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "membership_level": user.membership_level,
            "total_questions": count_map.get(user.id, 0),
            "created_at": user.created_at,
        })

    entries.sort(key=lambda x: x["total_questions"], reverse=True)
    for i, entry in enumerate(entries):
        entry["rank"] = i + 1

    return entries


# ── 新增：设置用户等级 ────────────────────────────────────────────────

def set_user_membership(db: Session, user_id: int, membership_level: str) -> Optional[User]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    user.membership_level = membership_level
    db.commit()
    db.refresh(user)
    return user
