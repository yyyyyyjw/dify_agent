from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date

from app.db.session import get_db
from app.api.auth import get_current_user
from app.models.models import User, MEMBERSHIP_LEVELS
from app.schemas.admin import (
    AdminConversation,
    UserDayQueryDetail,
    UserHeatmapData,
    LeaderboardEntry,
    MembershipUpdateRequest,
)
from app.schemas.user import ResetPasswordRequest
from app.crud import admin as admin_crud
from app.crud import user as user_crud

router = APIRouter()


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


@router.get("/conversations", response_model=List[AdminConversation])
def admin_get_conversations(
    min_rating: Optional[int] = Query(None, ge=1, le=10, description="最低评分过滤"),
    max_rating: Optional[int] = Query(None, ge=1, le=10, description="最高评分过滤"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    管理员：获取所有对话（含用户信息、消息、feedback），支持按评分区间过滤。
    """
    conversations = admin_crud.get_all_conversations_with_messages(
        db, min_rating=min_rating, max_rating=max_rating
    )

    result = []
    for conv in conversations:
        messages_with_feedback = []
        for msg in sorted(conv.messages, key=lambda m: m.created_at):
            messages_with_feedback.append({
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at,
                "feedback": msg.feedback,
            })

        result.append({
            "id": conv.id,
            "title": conv.title,
            "dify_conversation_id": conv.dify_conversation_id,
            "created_at": conv.created_at,
            "user_id": conv.user.id,
            "username": conv.user.username,
            "messages": messages_with_feedback,
        })

    return result


@router.get("/daily-query-stats", response_model=List[UserDayQueryDetail])
def admin_get_daily_query_stats(
    target_date: Optional[date] = Query(None, description="查询日期，默认今天 (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    管理员：获取所有用户在指定日期的提问数（AI 正常响应）及对应的会话列表。
    """
    return admin_crud.get_all_users_daily_query_detail(db, target_date=target_date)


@router.get("/monthly-heatmap", response_model=List[UserHeatmapData])
def admin_get_monthly_heatmap(
    year: int = Query(..., ge=2020, le=2100, description="年份"),
    month: int = Query(..., ge=1, le=12, description="月份"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    管理员：获取所有用户指定月份每天的提问数，用于 GitHub 风格热力图。
    """
    return admin_crud.get_all_users_monthly_heatmap(db, year=year, month=month)


@router.get("/leaderboard", response_model=List[LeaderboardEntry])
def admin_get_leaderboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    管理员：获取所有用户的总提问数排行榜。
    """
    return admin_crud.get_leaderboard(db)


@router.put("/users/{user_id}/membership")
def admin_set_membership(
    user_id: int,
    request: MembershipUpdateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    管理员：设置指定用户的用户等级。
    """
    if request.membership_level not in MEMBERSHIP_LEVELS:
        raise HTTPException(
            status_code=400,
            detail=f"无效的用户等级，可选值：{', '.join(MEMBERSHIP_LEVELS)}",
        )
    user = admin_crud.set_user_membership(db, user_id=user_id, membership_level=request.membership_level)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"message": "用户等级已更新", "membership_level": user.membership_level}


@router.post("/users/{user_id}/reset-password")
def admin_reset_user_password(
    user_id: int,
    request: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """
    管理员：重置指定用户的密码。
    """
    target = user_crud.get_user(db, user_id=user_id)
    if not target:
        raise HTTPException(status_code=404, detail="用户不存在")
    user_crud.set_password(db, target, request.new_password)
    return {"message": "密码已重置"}
