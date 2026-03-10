import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.session import get_db, SessionLocal
from app.api.auth import get_current_user
from app.models.models import User
from app.schemas.chat import ChatRequest, Conversation, Message
from app.crud import chat as chat_crud
from app.core.dify import dify_client

router = APIRouter()

@router.post("/chat")
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    发送消息并流式获取 Dify 工作流结果
    """
    # 1. 确定对话 ID
    conversation_id = request.conversation_id
    if not conversation_id:
        # 创建新对话
        auto_title = request.query[:20] + "..." if len(request.query) > 20 else request.query
        db_conv = chat_crud.create_conversation(
            db, 
            conversation_in=chat_crud.ConversationCreate(
                user_id=current_user.id,
                title=auto_title
            )
        )
        conversation_id = db_conv.id
    else:
        # 验证对话归属
        db_conv = chat_crud.get_conversation(db, conversation_id=conversation_id)
        if not db_conv or db_conv.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this conversation")

    # 2. 记录用户提问
    db_user_msg = chat_crud.create_message(
        db,
        message_in=chat_crud.MessageCreate(
            conversation_id=conversation_id,
            role="user",
            content=request.query
        )
    )

    # 获取该对话在 Dify 侧的 conversation_id（用于多轮上下文）
    dify_conv_id = db_conv.dify_conversation_id if db_conv else None

    # 3. 调用 Dify Chatflow 并流式返回
    # 注意：StreamingResponse 在路由函数返回后才开始消费生成器，此时 Depends(get_db)
    # 注入的 db session 已被 FastAPI 关闭，因此在生成器内部独立创建新 session。
    async def event_generator():
        full_answer = ""
        dify_message_id = None
        new_dify_conv_id = None
        user_msg_id = db_user_msg.id

        # 先把本地 conversation_id 告知前端，让前端能正确关联后续消息
        yield f"data: {json.dumps({'event': 'conversation_created', 'conversation_id': conversation_id})}\n\n"

        stream_db = SessionLocal()
        try:
            async for chunk in dify_client.send_chat_message(
                query=request.query,
                user_id=current_user.username,
                dify_conversation_id=dify_conv_id,
                inputs=request.inputs,
            ):
                event = chunk.get("event")
                
                # 从 chunk 中提取 dify_message_id 并更新用户消息
                current_msg_id = chunk.get("message_id") or chunk.get("id")
                if current_msg_id and not dify_message_id:
                    dify_message_id = current_msg_id
                    chat_crud.update_message_dify_id(stream_db, user_msg_id, dify_message_id)

                if event in ("message", "agent_message"):
                    # 流式文本块（基础 LLM / Agent 应用）
                    text = chunk.get("answer", "")
                    full_answer += text
                    new_dify_conv_id = chunk.get("conversation_id") or new_dify_conv_id
                    yield f"data: {json.dumps(chunk)}\n\n"

                elif event == "text_chunk":
                    # 流式文本块（Chatflow / Workflow 应用）
                    text = chunk.get("data", {}).get("text", "")
                    full_answer += text
                    yield f"data: {json.dumps(chunk)}\n\n"

                elif event in ("message_end", "workflow_finished"):
                    # 流结束，保存 AI 完整回答到数据库
                    new_dify_conv_id = chunk.get("conversation_id") or new_dify_conv_id

                    # chatflow 通过 text_chunk 累积；基础 LLM 通过 message 累积
                    # message_end 的 answer 字段作为兜底（部分 Dify 版本携带）
                    if not full_answer:
                        full_answer = chunk.get("answer", "")

                    chat_crud.create_message(
                        stream_db,
                        message_in=chat_crud.MessageCreate(
                            conversation_id=conversation_id,
                            role="assistant",
                            content=full_answer,
                            dify_message_id=dify_message_id
                        )
                    )

                    # 检查并更新用户等级（用 stream_db 重新加载 user，避免 DetachedInstanceError）
                    from app.crud import user as user_crud
                    fresh_user = stream_db.query(User).filter(User.id == current_user.id).first()
                    if fresh_user:
                        user_crud.update_user_membership_by_questions(stream_db, fresh_user)

                    # 如果是新对话，把 Dify 返回的 conversation_id 存起来
                    if new_dify_conv_id and not dify_conv_id:
                        chat_crud.update_conversation_dify_id(stream_db, conversation_id, new_dify_conv_id)

                    yield f"data: {json.dumps(chunk)}\n\n"

                elif event in ("error", "node_started", "node_finished", "workflow_started"):
                    yield f"data: {json.dumps(chunk)}\n\n"
        finally:
            stream_db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/conversations", response_model=list[Conversation])
def get_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return chat_crud.get_user_conversations(db, user_id=current_user.id)

@router.get("/conversations/{conversation_id}/messages", response_model=list[Message])
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_conv = chat_crud.get_conversation(db, conversation_id=conversation_id)
    if not db_conv or db_conv.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return chat_crud.get_conversation_messages(db, conversation_id=conversation_id)
