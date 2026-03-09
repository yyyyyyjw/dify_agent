'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, History, LogOut, User, MessageSquare, Target, AlertCircle, X, KeyRound, Eye, EyeOff } from 'lucide-react';
import { fetchSSE } from '@/lib/api';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Feedback from './Feedback';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CST_OFFSET = 8 * 60 * 60 * 1000;

function toCst(iso: string) {
  // 后端返回的 naive datetime 没有时区标识，需补 Z 明确为 UTC，避免浏览器按本地时间解析后再 +8 导致双重偏移
  const normalized = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(new Date(normalized).getTime() + CST_OFFSET);
}

function formatTime(iso: string) {
  const d = toCst(iso);
  const today = toCst(new Date().toISOString());
  const isToday =
    d.getUTCFullYear() === today.getUTCFullYear() &&
    d.getUTCMonth() === today.getUTCMonth() &&
    d.getUTCDate() === today.getUTCDate();
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  if (isToday) return `${h}:${m}`;
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${h}:${m}`;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  feedback?: {
    rating: number;
    comment: string;
  };
}

interface Conversation {
  id: number;
  title: string;
  created_at: string;
}

const ChatWindow = () => {
  const { user, logout, refreshUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 实时追踪当前视图对话 ID，供 SSE 回调（闭包）同步读取
  const currentConversationIdRef = useRef<number | null>(null);

  // 正在流式加载中的对话 ID（'new' 表示新对话尚未获得真实 ID）
  // ref 用于同步守卫（避免 React 异步 state 导致两次快速发送都通过检查）
  // state 用于驱动 UI 渲染
  const loadingConvIdsRef = useRef<Set<number | 'new'>>(new Set());
  const [loadingConvIds, setLoadingConvIds] = useState<Set<number | 'new'>>(new Set());

  const syncLoadingAdd = (key: number | 'new') => {
    loadingConvIdsRef.current.add(key);
    setLoadingConvIds(new Set(loadingConvIdsRef.current));
  };
  const syncLoadingDelete = (...keys: (number | 'new')[]) => {
    keys.forEach(k => loadingConvIdsRef.current.delete(k));
    setLoadingConvIds(new Set(loadingConvIdsRef.current));
  };

  // 用户不在查看时已完成的对话 ID，用于侧边栏小圆点提示
  const [pendingConvIds, setPendingConvIds] = useState<Set<number>>(new Set());

  // 每日评价目标进度
  const [dailyProgress, setDailyProgress] = useState<{ completed: number; goal: number } | null>(null);

  // 本地提问计数器：每次 AI 响应完成立刻 +1，实现等级变化零延迟
  const [localQuestionCount, setLocalQuestionCount] = useState<number>(0);
  const localCountInitedRef = useRef(false);

  // 首次获取到 user 数据时，用服务端值初始化；refreshUser 后取较大值（多设备同步）
  useEffect(() => {
    if (!user) return;
    const serverCount = user.total_questions ?? 0;
    if (!localCountInitedRef.current) {
      setLocalQuestionCount(serverCount);
      localCountInitedRef.current = true;
    } else {
      setLocalQuestionCount(q => Math.max(q, serverCount));
    }
  }, [user?.total_questions]); // eslint-disable-line react-hooks/exhaustive-deps

  // 根据本地计数实时计算当前等级
  const effectiveLevel = LEVEL_THRESHOLDS.reduce(
    (found, t) => localQuestionCount >= t.min ? t.level : found,
    'free'
  );

  // 升级动画状态（只在 message_end 里主动触发，不用 effect 监听）
  const [showLevelUp, setShowLevelUp] = useState(false);

  // 修改密码弹窗
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [changePwdOld, setChangePwdOld] = useState('');
  const [changePwdNew, setChangePwdNew] = useState('');
  const [changePwdConfirm, setChangePwdConfirm] = useState('');
  const [changePwdError, setChangePwdError] = useState('');
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const openChangePwd = () => {
    setChangePwdOld(''); setChangePwdNew(''); setChangePwdConfirm('');
    setChangePwdError(''); setShowOldPwd(false); setShowNewPwd(false);
    setShowChangePwd(true);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changePwdNew !== changePwdConfirm) {
      setChangePwdError('两次输入的新密码不一致');
      return;
    }
    if (changePwdNew.length < 6) {
      setChangePwdError('新密码至少需要 6 位');
      return;
    }
    setChangePwdLoading(true);
    setChangePwdError('');
    try {
      await api.post('/auth/change-password', { old_password: changePwdOld, new_password: changePwdNew });
      setShowChangePwd(false);
      showToast('密码修改成功');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setChangePwdError(detail || '修改失败，请稍后重试');
    } finally {
      setChangePwdLoading(false);
    }
  };

  // Toast 提示
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, id: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const resolveErrorMessage = (error: unknown, context: 'send' | 'load' | 'generic' = 'generic') => {
    const msg = error instanceof Error ? error.message : '';
    if (msg.startsWith('HTTP_')) {
      const code = parseInt(msg.slice(5));
      if (code === 500) return '服务器内部错误，请稍后重试';
      if (code === 502 || code === 503) return '服务暂时不可用，请稍后重试';
      if (code === 504) return '服务器响应超时，请稍后重试';
      if (code === 429) return '请求过于频繁，请稍等一下';
      return `请求失败（错误码 ${code}），请稍后重试`;
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
      return '网络连接失败，请检查网络后重试';
    }
    if (context === 'send') return '消息发送失败，请稍后重试';
    if (context === 'load') return '加载失败，请刷新后重试';
    return '操作失败，请稍后重试';
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchConversations();
    fetchDailyProgress();
    refreshUser();
  }, []);

  const fetchDailyProgress = async () => {
    try {
      const response = await api.get('/feedback/daily-progress');
      setDailyProgress(response.data);
    } catch (error) {
      // console.error('Failed to fetch daily progress', error);
    }
  };

  const fetchMe = async () => {
    try {
      const response = await api.get('/auth/me');
      // 这里需要确保 AuthContext 里的 user 被更新，或者我们本地存一份
      // 考虑到 ChatWindow 已经通过 useAuth 拿到了 user，
      // 如果 AuthContext 里的 setUser 没暴露出来，我们需要在 AuthContext 里处理。
    } catch (error) {
      console.error('Failed to fetch me', error);
    }
  };

  // 保持 ref 与 state 同步
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  const fetchConversations = async () => {
    try {
      const response = await api.get('/chat/conversations');
      setConversations(response.data);
    } catch (error) {
      console.error('Failed to fetch conversations', error);
      showToast(resolveErrorMessage(error, 'load'));
    }
  };

  const selectConversation = async (id: number) => {
    // 同步更新 ref，确保后续 SSE 回调立即感知到视图切换
    currentConversationIdRef.current = id;
    setCurrentConversationId(id);
    // 清除未读提示
    setPendingConvIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    try {
      const response = await api.get(`/chat/conversations/${id}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Failed to fetch messages', error);
      showToast(resolveErrorMessage(error, 'load'));
    }
  };

  const startNewChat = () => {
    currentConversationIdRef.current = null;
    setCurrentConversationId(null);
    setMessages([]);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // 当前对话是否正在加载（用 ref 同步检查，避免 React 异步 state 导致竞态条件）
    const convKey: number | 'new' = currentConversationId ?? 'new';
    if (loadingConvIdsRef.current.has(convKey)) return;

    // 快照发送时的对话 ID（null = 从新对话框发出）
    const sendingConvId = currentConversationId;
    const sendingInput = input;

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: sendingInput,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    syncLoadingAdd(sendingConvId ?? 'new');

    let assistantMessageId = Date.now() + 1;
    let assistantContent = '';
    let activeConversationId: number | null = sendingConvId;

    try {
      await fetchSSE('/chat/chat',
        {
          query: sendingInput,
          conversation_id: sendingConvId,
        },
        (data) => {
          if (data.event === 'conversation_created') {
            activeConversationId = data.conversation_id;

            // 将加载标记从 'new' 转为真实 ID
            syncLoadingDelete('new');
            syncLoadingAdd(data.conversation_id);

            // 更新侧边栏列表
            setConversations(prev => {
              if (prev.some(c => c.id === data.conversation_id)) return prev;
              const autoTitle = sendingInput.length > 20 ? sendingInput.slice(0, 20) + '...' : sendingInput;
              return [{ id: data.conversation_id, title: autoTitle, created_at: new Date().toISOString() }, ...prev];
            });

            // 只有用户还停留在发送时的「新对话框」才自动切换视图
            if (sendingConvId === null && currentConversationIdRef.current === null) {
              currentConversationIdRef.current = data.conversation_id;
              setCurrentConversationId(data.conversation_id);
            }

          } else if (data.event === 'message' || data.event === 'agent_message') {
            assistantContent += data.answer;

            // 只在用户正在查看这个对话时才更新显示
            if (currentConversationIdRef.current === activeConversationId) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { ...last, content: assistantContent }];
                }
                return [...prev, {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: assistantContent,
                  created_at: new Date().toISOString(),
                }];
              });
            }

          } else if (data.event === 'message_end' || data.event === 'workflow_finished') {
            // 本地计数立即 +1，同时判断是否升级（纯同步，无 effect 竞态）
            setLocalQuestionCount(prev => {
              const next = prev + 1;
              const oldIdx = LEVEL_THRESHOLDS.reduce((acc, t, i) => prev >= t.min ? i : acc, 0);
              const newIdx = LEVEL_THRESHOLDS.reduce((acc, t, i) => next >= t.min ? i : acc, 0);
              if (newIdx > oldIdx) {
                setShowLevelUp(true);
                setTimeout(() => setShowLevelUp(false), 5000);
              }
              return next;
            });
            fetchConversations();
            refreshUser();
          }
        }
      );
    } catch (error) {
      console.error('Chat error', error);
      showToast(resolveErrorMessage(error, 'send'));
    } finally {
      const finalConvId = activeConversationId;

      syncLoadingDelete(...([finalConvId, 'new' as const].filter(Boolean) as (number | 'new')[]));

      if (finalConvId !== null) {
        if (currentConversationIdRef.current === finalConvId) {
          // 用户仍在查看 → 刷新消息以获取真实数据库 ID（用于评分）
          selectConversation(finalConvId);
        } else {
          // 用户已切走 → 侧边栏打点提示，不强制跳转
          setPendingConvIds(prev => new Set(prev).add(finalConvId));
        }
      }
    }
  };

  const currentConvKey: number | 'new' = currentConversationId ?? 'new';
  const isCurrentConvLoading = loadingConvIds.has(currentConvKey);

  return (
    <div className="flex h-screen bg-neutral-50 text-gray-900">
      {/* Sidebar */}
      <div className={cn(
        "bg-white border-r border-gray-100 flex flex-col transition-all duration-300 ease-in-out shrink-0",
        isSidebarOpen ? "w-[300px]" : "w-0 overflow-hidden"
      )}>
        {/* Sidebar Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <MessageSquare size={14} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-semibold text-[15px] tracking-tight text-gray-900">Assistant</span>
          </div>
          <button
            onClick={startNewChat}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="新对话"
          >
            <Plus size={17} />
          </button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* 新对话区域 */}
          <div className="px-2 pt-2 pb-2">
            {currentConversationId === null ? (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium">
                <MessageSquare size={15} className="shrink-0" />
                <span className="truncate flex-1">新对话</span>
                {loadingConvIds.has('new') && (
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shrink-0" />
                )}
              </div>
            ) : (
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              >
                <Plus size={15} className="shrink-0" />
                <span>新对话</span>
              </button>
            )}
          </div>

          {/* 分隔线 */}
          {conversations.length > 0 && (
            <div className="mx-3 mb-1.5 flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] text-gray-400 font-medium tracking-wide">历史记录</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
          )}

          {/* 历史列表 */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {conversations.map((conv) => {
              const isActive = currentConversationId === conv.id;
              const isLoading = loadingConvIds.has(conv.id);
              const hasPending = pendingConvIds.has(conv.id);

              return (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left",
                    isActive
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )}
                >
                  <MessageSquare size={15} className="shrink-0 opacity-60" />
                  <span className="truncate flex-1">{conv.title}</span>
                  {/* 正在生成：脉冲蓝点 */}
                  {isLoading && (
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shrink-0" />
                  )}
                  {/* 已完成但未查看：实心蓝点 */}
                  {hasPending && !isLoading && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Daily Goal Progress */}
        {dailyProgress && (
          <div className="px-3 py-3 border-t border-gray-100">
            <DailyGoalCard completed={dailyProgress.completed} goal={dailyProgress.goal} />
          </div>
        )}

        {/* Membership Level Progress */}
        {user && !user.is_admin && (
          <div className="px-3 py-3 border-t border-gray-100">
            <MembershipLevelCard
              level={effectiveLevel}
              totalQuestions={localQuestionCount}
            />
          </div>
        )}

        {/* User Footer */}
        <div className="p-3 border-t border-gray-100 space-y-0.5">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
              <User size={14} className="text-gray-500" />
            </div>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-sm font-medium text-gray-700 truncate">{user?.username}</span>
              {user && !user.is_admin && (
                <MembershipTag level={effectiveLevel} />
              )}
            </div>
          </div>
          <button
            onClick={openChangePwd}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <KeyRound size={15} />
            <span>修改密码</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={15} />
            <span>退出登录</span>
          </button>
        </div>
      </div>

      {/* 修改密码弹窗 */}
      {showChangePwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">修改密码</h2>
              <button onClick={() => setShowChangePwd(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            {changePwdError && (
              <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
                {changePwdError}
              </div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">当前密码</label>
                <div className="relative">
                  <input
                    type={showOldPwd ? 'text' : 'password'}
                    required
                    value={changePwdOld}
                    onChange={e => setChangePwdOld(e.target.value)}
                    placeholder="请输入当前密码"
                    className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <button type="button" onClick={() => setShowOldPwd(!showOldPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showOldPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">新密码</label>
                <div className="relative">
                  <input
                    type={showNewPwd ? 'text' : 'password'}
                    required
                    value={changePwdNew}
                    onChange={e => setChangePwdNew(e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                  />
                  <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">确认新密码</label>
                <input
                  type="password"
                  required
                  value={changePwdConfirm}
                  onChange={e => setChangePwdConfirm(e.target.value)}
                  placeholder="再次输入新密码"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowChangePwd(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">
                  取消
                </button>
                <button type="submit" disabled={changePwdLoading} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-all">
                  {changePwdLoading ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Level Up Animation */}
        {showLevelUp && (
          <div className="absolute inset-0 z-[60] pointer-events-none flex items-center justify-center overflow-hidden">
            <LevelUpAnimation level={effectiveLevel} />
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            key={toast.id}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl shadow-md text-sm max-w-sm w-[calc(100%-2rem)] animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 text-red-400 hover:text-red-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center gap-3 px-4 shrink-0">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <History size={18} />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm text-gray-600 font-medium truncate max-w-xs">
            {currentConversationId
              ? (conversations.find(c => c.id === currentConversationId)?.title || '当前对话')
              : '新对话'}
          </span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center min-h-[55vh] text-center gap-4">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <MessageSquare size={26} className="text-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold text-gray-800">今天想聊点什么？</p>
                  <p className="text-sm text-gray-400">有任何问题，随时告诉我</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1.5",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "bg-blue-600 text-white whitespace-pre-wrap"
                    : "bg-white border border-gray-200 text-gray-800 shadow-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:mt-3 prose-headings:mb-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1 prose-blockquote:my-1 prose-hr:my-2"
                )}>
                  {msg.role === 'user' ? msg.content : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const isBlock = className?.includes('language-');
                          return isBlock ? (
                            <pre className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 overflow-x-auto text-xs my-1">
                              <code className={className} {...props}>{children}</code>
                            </pre>
                          ) : (
                            <code className="bg-gray-100 text-gray-800 rounded px-1 py-0.5 text-xs font-mono" {...props}>{children}</code>
                          );
                        },
                        a({ href, children }) {
                          return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{children}</a>;
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>

                <span className="text-[11px] text-gray-400 px-1">
                  {formatTime(msg.created_at)}
                </span>

                {msg.role === 'assistant' && (
                  <Feedback
                    messageId={msg.id}
                    initialRating={msg.feedback?.rating}
                    initialComment={msg.feedback?.comment}
                    onSubmitted={fetchDailyProgress}
                  />
                )}
              </div>
            ))}

            {/* 打字指示器：当前对话正在加载且最后一条是用户消息 */}
            {isCurrentConvLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 shadow-sm">
                  <div className="flex gap-1.5 items-center h-4">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-transparent shrink-0">
          <form
            onSubmit={handleSendMessage}
            className="max-w-2xl mx-auto"
          >
            <div className="relative flex items-center bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-gray-300 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-50 transition-all duration-200">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入你的问题..."
                disabled={isCurrentConvLoading}
                className="flex-1 py-3.5 pl-5 pr-14 bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || isCurrentConvLoading}
                className="absolute right-2 w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-center text-[11px] text-gray-400 mt-2.5">
              AI 生成内容仅供参考
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

const DAILY_HINTS = [
  { max: 0, text: '今天还没有评价，快去聊一聊吧！' },
  { max: 1, text: '已完成 1 个，再来 1 个就达成目标！' },
  { max: 2, text: '今日目标达成，明天继续加油！' },
  { max: Infinity, text: '超额完成，你今天真棒！' },
];

const CONFETTI_PARTICLES = [
  { color: '#4ade80', left: '8%',  delay: '0ms',   size: 4 },
  { color: '#60a5fa', left: '22%', delay: '60ms',  size: 3 },
  { color: '#fbbf24', left: '38%', delay: '20ms',  size: 4 },
  { color: '#a78bfa', left: '52%', delay: '80ms',  size: 3 },
  { color: '#34d399', left: '66%', delay: '40ms',  size: 4 },
  { color: '#f472b6', left: '80%', delay: '100ms', size: 3 },
  { color: '#60a5fa', left: '92%', delay: '10ms',  size: 4 },
];

function DailyGoalCard({ completed, goal }: { completed: number; goal: number }) {
  const pct = Math.min((completed / goal) * 100, 100);
  const isDone = completed >= goal;
  const hint = DAILY_HINTS.find(h => completed <= h.max)?.text ?? DAILY_HINTS[DAILY_HINTS.length - 1].text;

  const [showConfetti, setShowConfetti] = useState(false);
  const prevDoneRef = useRef(false);

  useEffect(() => {
    if (isDone && !prevDoneRef.current) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 1200);
      prevDoneRef.current = true;
      return () => clearTimeout(t);
    }
    if (!isDone) prevDoneRef.current = false;
  }, [isDone]);

  return (
    <div className={cn(
      "relative rounded-xl p-3 space-y-2.5 border transition-colors overflow-hidden",
      isDone
        ? "bg-green-50 border-green-100"
        : "bg-blue-50/60 border-blue-100/80"
    )}>
      <style>{`
        @keyframes confetti-rise {
          0%   { transform: translateY(0)   scale(1);   opacity: 1; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(-52px) scale(0.4); opacity: 0; }
        }
      `}</style>

      {/* 彩带粒子 */}
      {showConfetti && CONFETTI_PARTICLES.map((p, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            bottom: '6px',
            left: p.left,
            width: p.size,
            height: p.size * 2.2,
            borderRadius: '1px',
            background: p.color,
            opacity: 0,
            animation: `confetti-rise 900ms ${p.delay} ease-out forwards`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Target size={13} className={isDone ? "text-green-600" : "text-blue-500"} />
          <span className={cn("text-[11px] font-semibold tracking-wide", isDone ? "text-green-700" : "text-blue-700")}>
            今日目标
          </span>
        </div>
        <span className={cn("text-xs font-bold tabular-nums", isDone ? "text-green-600" : "text-blue-600")}>
          {completed} / {goal}
        </span>
      </div>

      {/* 进度条 */}
      <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isDone ? "bg-green-500" : "bg-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className={cn("text-[11px] leading-relaxed", isDone ? "text-green-600" : "text-blue-500/90")}>
        {hint}
      </p>
    </div>
  );
}

const LEVEL_THRESHOLDS = [
  { level: 'free',    min: 0,   label: '普通', icon: '○',  color: 'text-gray-500',   bg: 'bg-gray-400',   tagBg: 'bg-gray-100',    tagText: 'text-gray-500'   },
  { level: 'bronze',  min: 1,   label: '青铜', icon: '🥉', color: 'text-amber-700',  bg: 'bg-amber-600',  tagBg: 'bg-amber-50',    tagText: 'text-amber-700'  },
  { level: 'silver',  min: 10,  label: '白银', icon: '🥈', color: 'text-slate-500',  bg: 'bg-slate-500',  tagBg: 'bg-slate-100',   tagText: 'text-slate-600'  },
  { level: 'gold',    min: 30,  label: '黄金', icon: '🥇', color: 'text-yellow-600', bg: 'bg-yellow-500', tagBg: 'bg-yellow-50',   tagText: 'text-yellow-700' },
  { level: 'diamond', min: 50,  label: '钻石', icon: '💎', color: 'text-cyan-600',   bg: 'bg-cyan-600',   tagBg: 'bg-cyan-50',     tagText: 'text-cyan-700'   },
  { level: 'king',    min: 100, label: '王者', icon: '👑', color: 'text-purple-700', bg: 'bg-purple-600', tagBg: 'bg-purple-50',   tagText: 'text-purple-700' },
];

function MembershipTag({ level }: { level: string }) {
  const cfg = LEVEL_THRESHOLDS.find(t => t.level === level) ?? LEVEL_THRESHOLDS[0];
  return (
    <span className={cn('w-fit inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none mt-0.5', cfg.tagBg, cfg.tagText)}>
      {cfg.icon} {cfg.label}用户
    </span>
  );
}

function MembershipLevelCard({ level, totalQuestions }: { level: string; totalQuestions: number }) {
  // 取「提问数算出的等级」和「后端字段」中更高者，保证前端实时准确
  const earnedIndex = LEVEL_THRESHOLDS.reduce((acc, t, i) => totalQuestions >= t.min ? i : acc, 0);
  const backendIndex = Math.max(LEVEL_THRESHOLDS.findIndex(t => t.level === level), 0);
  const currentIndex = Math.max(earnedIndex, backendIndex);

  const nextThreshold = LEVEL_THRESHOLDS[currentIndex + 1];
  const currentThreshold = LEVEL_THRESHOLDS[currentIndex];

  if (!nextThreshold) {
    return (
      <div className="rounded-xl p-3 space-y-2 bg-purple-50 border border-purple-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">👑</span>
            <span className="text-[11px] font-bold text-purple-700">最高等级：王者用户</span>
          </div>
          <span className="text-xs font-bold text-purple-600 tabular-nums">{totalQuestions} 次提问</span>
        </div>
        <p className="text-[10px] text-purple-600/80">您已达到最高用户等级，感谢支持！</p>
      </div>
    );
  }

  const needed = nextThreshold.min - currentThreshold.min;
  const progress = Math.max(totalQuestions - currentThreshold.min, 0);
  const pct = needed > 0 ? Math.min((progress / needed) * 100, 100) : 100;
  const remaining = Math.max(nextThreshold.min - totalQuestions, 0);

  return (
    <div className="rounded-xl p-3 space-y-2 bg-gray-50 border border-gray-100">
      {/* 进度条：当前 → 下一级 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">距下一级 {nextThreshold.icon} {nextThreshold.label}</span>
          <span className="text-[10px] font-medium text-gray-500 tabular-nums">{totalQuestions} / {nextThreshold.min}</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", nextThreshold.bg)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="text-[10px] text-gray-400">
        还需 <span className={cn("font-semibold", nextThreshold.tagText)}>{remaining}</span> 次提问即可升级
      </p>
    </div>
  );
}

function LevelUpAnimation({ level }: { level: string }) {
  const cfg = LEVEL_THRESHOLDS.find(t => t.level === level) || LEVEL_THRESHOLDS[0];
  
  return (
    <div className="flex flex-col items-center animate-in zoom-in fade-in duration-500">
      <div className="relative">
        <div className="absolute inset-0 bg-yellow-400 blur-2xl opacity-20 animate-pulse" />
        <div className="text-7xl mb-4 relative drop-shadow-2xl">{cfg.icon}</div>
      </div>
      <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">等级提升！</h2>
      <p className="text-gray-500 font-medium">恭喜晋升为 <span className={cn("font-bold", cfg.color)}>{cfg.label}用户</span></p>
      
      {/* 简单的彩带粒子效果 */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-bounce"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: '8px',
              height: '8px',
              backgroundColor: ['#fbbf24', '#60a5fa', '#f87171', '#4ade80', '#a78bfa'][i % 5],
              borderRadius: '2px',
              transform: `rotate(${Math.random() * 360}deg)`,
              animation: `confetti-fall ${2 + Math.random() * 2}s linear infinite`,
              opacity: Math.random(),
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default ChatWindow;
