'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  LogOut,
  AlertCircle,
  Star,
  Calendar,
  List,
  Copy,
  Check,
  Search,
  KeyRound,
  Eye,
  EyeOff,
  X,
  XCircle,
  Trophy,
  Crown,
  Users,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminFeedback {
  id: number;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface AdminMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  feedback: AdminFeedback | null;
}

interface AdminConversation {
  id: number;
  title: string | null;
  dify_conversation_id: string | null;
  created_at: string;
  user_id: number;
  username: string;
  messages: AdminMessage[];
}

interface ConvSummary {
  id: number;
  dify_conversation_id: string | null;
  title: string | null;
  question_count: number;
}

interface UserDayQueryDetail {
  user_id: number;
  username: string;
  email: string;
  membership_level: string;
  question_count: number;
  conversations: ConvSummary[];
}

interface UserHeatmapData {
  user_id: number;
  username: string;
  email: string;
  membership_level: string;
  created_at: string;
  days: Record<string, number>;
}

interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  email: string;
  membership_level: string;
  total_questions: number;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CST_OFFSET = 8 * 60 * 60 * 1000;

function toCst(iso: string) {
  const normalized = /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
  return new Date(new Date(normalized).getTime() + CST_OFFSET);
}

function formatTime(iso: string) {
  const d = toCst(iso);
  const y = d.getUTCFullYear();
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${y}-${mo}-${day} ${h}:${m}`;
}

function todayString() {
  const now = new Date(Date.now() + CST_OFFSET);
  const y = now.getUTCFullYear();
  const mo = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function ratingColor(rating: number) {
  if (rating <= 3) return 'text-red-600 bg-red-50 border-red-200';
  if (rating <= 6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  return 'text-green-600 bg-green-50 border-green-200';
}

// ─── 用户等级配置 ─────────────────────────────────────────────────────────────

const MEMBERSHIP_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  free:    { label: '普通',   color: 'text-gray-500',   bg: 'bg-gray-100',    border: 'border-gray-200',   icon: '○'  },
  bronze:  { label: '青铜',   color: 'text-amber-700',  bg: 'bg-amber-50',    border: 'border-amber-200',  icon: '🥉' },
  silver:  { label: '白银',   color: 'text-slate-500',  bg: 'bg-slate-100',   border: 'border-slate-300',  icon: '🥈' },
  gold:    { label: '黄金',   color: 'text-yellow-600', bg: 'bg-yellow-50',   border: 'border-yellow-300', icon: '🥇' },
  diamond: { label: '钻石',   color: 'text-cyan-600',   bg: 'bg-cyan-50',     border: 'border-cyan-300',   icon: '💎' },
  king:    { label: '王者',   color: 'text-purple-700', bg: 'bg-purple-50',   border: 'border-purple-300', icon: '👑' },
};

const MEMBERSHIP_LEVELS = ['free', 'bronze', 'silver', 'gold', 'diamond', 'king'];

function MembershipBadge({ level }: { level: string }) {
  const cfg = MEMBERSHIP_CONFIG[level] ?? MEMBERSHIP_CONFIG.free;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

// ─── 热力图颜色 ───────────────────────────────────────────────────────────────

function heatmapColor(count: number): string {
  if (count === 0) return 'bg-gray-100';
  if (count <= 2)  return 'bg-emerald-200';
  if (count <= 5)  return 'bg-emerald-400';
  if (count <= 9)  return 'bg-emerald-600';
  return 'bg-emerald-800';
}

function heatmapTooltip(count: number, dateStr: string): string {
  if (count === 0) return `${dateStr}：无提问`;
  return `${dateStr}：${count} 次提问`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${ratingColor(rating)}`}>
      <Star size={11} className="fill-current" />
      {rating}/10
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? '已复制' : '点击复制完整 ID'}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono transition-all ${
        copied
          ? 'text-xs text-green-600 bg-green-50'
          : 'text-[11px] text-gray-400 hover:text-gray-600 hover:bg-gray-100'
      }`}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? '已复制' : text}
    </button>
  );
}

function ConversationCard({ conv, filterMin, filterMax, showUnratedOnly }: {
  conv: AdminConversation;
  filterMin: number | null;
  filterMax: number | null;
  showUnratedOnly: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const isFilterActive = filterMin !== null || filterMax !== null || showUnratedOnly;

  const visibleMessages: AdminMessage[] = (() => {
    if (!isFilterActive) return conv.messages;
    const result: AdminMessage[] = [];
    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i];
      if (msg.role !== 'assistant') continue;
      let match = false;
      if (showUnratedOnly) {
        match = !msg.feedback;
      } else {
        if (msg.feedback) {
          const r = msg.feedback.rating;
          match = (filterMin === null || r >= filterMin) && (filterMax === null || r <= filterMax);
        }
      }
      if (match) {
        if (i > 0 && conv.messages[i - 1].role === 'user') result.push(conv.messages[i - 1]);
        result.push(msg);
      }
    }
    return result;
  })();

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-medium text-gray-800 truncate">
            {conv.title || `对话 #${conv.id}`}
          </span>
          <span className="shrink-0 text-xs text-white bg-blue-500 px-2 py-0.5 rounded-full">
            {conv.username}
          </span>
          {conv.dify_conversation_id ? (
            <span className="shrink-0 flex items-center gap-1">
              <span className="text-xs text-gray-400 font-mono hidden sm:inline">Conversation ID:</span>
              <CopyButton text={conv.dify_conversation_id} />
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-500 border border-red-200">
              <AlertCircle size={11} />
              无Conversation ID
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {isFilterActive && (
            <span className="text-xs text-gray-400">
              {visibleMessages.length / 2 | 0} 条匹配
            </span>
          )}
          <span className="text-xs text-gray-400">{formatTime(conv.created_at)}</span>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100">
          {visibleMessages.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 text-center">无匹配消息</p>
          ) : (
            visibleMessages.map(msg => {
              const isUser = msg.role === 'user';
              return (
                <div key={msg.id} className="px-4 py-3 bg-white">
                  <div className="flex items-start gap-3">
                    <div className="w-10 shrink-0 flex justify-center pt-0.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                        isUser ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {isUser ? '用户' : 'AI'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {isUser ? (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
                          {msg.content}
                        </p>
                      ) : (
                        <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none prose-p:my-0.5 prose-headings:mt-2 prose-headings:mb-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0 prose-pre:my-1 prose-blockquote:my-1 prose-hr:my-1.5">
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
                        </div>
                      )}
                      <span className="text-xs text-gray-400 mt-1 block">{formatTime(msg.created_at)}</span>
                    </div>
                    <div className="w-52 shrink-0">
                      {!isUser && msg.feedback ? (
                        <div className={`rounded-xl border p-3 flex flex-col gap-1.5 ${ratingColor(msg.feedback.rating)}`}>
                          <RatingBadge rating={msg.feedback.rating} />
                          {msg.feedback.comment && (
                            <p className="text-xs text-gray-600 italic leading-snug">
                              &ldquo;{msg.feedback.comment}&rdquo;
                            </p>
                          )}
                          <span className="text-xs text-gray-400 mt-auto pt-1 border-t border-current/10">
                            {formatTime(msg.feedback.created_at)}
                          </span>
                        </div>
                      ) : !isUser ? (
                        <div className="rounded-xl border border-dashed border-gray-200 px-3 py-2 flex items-center justify-center">
                          <span className="text-xs text-gray-300 select-none">未评价</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── GitHub 风格热力图卡片 ────────────────────────────────────────────────────

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function buildCalendarWeeks(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month - 1, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function UserHeatmapCard({
  user, year, month, onResetPassword, onSetMembership,
}: {
  user: UserHeatmapData;
  year: number;
  month: number;
  onResetPassword?: (userId: number, username: string) => void;
  onSetMembership?: (userId: number, username: string, current: string) => void;
}) {
  const weeks = buildCalendarWeeks(year, month);
  const today = todayString();
  const joinDate = user.created_at.slice(0, 10);

  const totalQuestions = Object.values(user.days).reduce((a, b) => a + b, 0);
  const activeDays = Object.values(user.days).filter(v => v > 0).length;
  const maxCount = Math.max(...Object.values(user.days), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-slate-500 flex items-center justify-center text-white font-bold text-base shrink-0">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-800 text-sm">{user.username}</p>
              <MembershipBadge level={user.membership_level} />
            </div>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            {onSetMembership && (
              <button
                onClick={() => onSetMembership(user.user_id, user.username, user.membership_level)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              >
                <Crown size={11} />
                等级
              </button>
            )}
            {onResetPassword && (
              <button
                onClick={() => onResetPassword(user.user_id, user.username)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <KeyRound size={11} />
                重置
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-1">
          <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-700 leading-tight">{totalQuestions}</p>
            <p className="text-xs text-gray-400 mt-0.5">本月提问</p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-700 leading-tight">{activeDays}</p>
            <p className="text-xs text-gray-400 mt-0.5">活跃天数</p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-gray-700 leading-tight">{maxCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">单日最高</p>
          </div>
        </div>
      </div>

      <div className="mx-4 border-t border-gray-100" />

      <div className="px-3 pb-4 pt-3">
        <div className="grid grid-cols-7 mb-1.5">
          {WEEK_LABELS.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-300 py-0.5">{d}</div>
          ))}
        </div>

        <div className="space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((ds, di) => {
                if (!ds) return <div key={di} />;
                const count = user.days[ds] ?? 0;
                const isFuture = ds > today;
                const isBeforeJoin = ds < joinDate;
                const isToday = ds === today;
                const dayNum = parseInt(ds.slice(8), 10);

                let cellClass = '';
                if (isBeforeJoin || isFuture) {
                  cellClass = 'bg-gray-50 border border-dashed border-gray-100';
                } else {
                  cellClass = heatmapColor(count);
                }

                return (
                  <div key={di} className="flex items-center justify-center">
                    <div
                      title={isBeforeJoin ? '注册前' : isFuture ? '待完成' : heatmapTooltip(count, ds)}
                      className={`
                        w-7 h-7 rounded-md flex items-center justify-center
                        text-[10px] font-medium select-none transition-all
                        ${cellClass}
                        ${isToday ? 'ring-2 ring-offset-1 ring-blue-400' : ''}
                        ${!isBeforeJoin && !isFuture ? 'hover:scale-110 cursor-default' : ''}
                        ${(isBeforeJoin || isFuture) ? 'text-gray-200' : count > 0 ? 'text-white' : 'text-gray-300'}
                      `}
                    >
                      {dayNum}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-50">
          <span className="text-[10px] text-gray-300 mr-1">少</span>
          {[0, 1, 3, 6, 10].map(n => (
            <div key={n} className={`w-3.5 h-3.5 rounded-sm ${heatmapColor(n)}`} title={n === 0 ? '0次' : `${n}次+`} />
          ))}
          <span className="text-[10px] text-gray-300 ml-1">多</span>
        </div>
      </div>
    </div>
  );
}

// ─── HeatmapView ─────────────────────────────────────────────────────────────

function HeatmapView({
  onResetPassword,
  onSetMembership,
  refreshKey,
}: {
  onResetPassword?: (userId: number, username: string) => void;
  onSetMembership?: (userId: number, username: string, current: string) => void;
  refreshKey?: number;
}) {
  const now = new Date(Date.now() + CST_OFFSET);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [data, setData] = useState<UserHeatmapData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/monthly-heatmap', { params: { year: y, month: m } });
      setData(res.data);
    } catch {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year, month); }, [year, month, load, refreshKey]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-base font-semibold text-gray-800 min-w-[90px] text-center">{year} 年 {month} 月</span>
        <button onClick={nextMonth} disabled={isCurrentMonth} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={16} />
        </button>
        {loading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 ml-2" />}
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} />{error}
        </div>
      ) : data.length === 0 && !loading ? (
        <div className="text-center py-20 text-gray-400">
          <Calendar size={40} className="mx-auto mb-3 opacity-30" />
          <p>暂无用户数据</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.map(user => (
            <UserHeatmapCard
              key={user.user_id}
              user={user}
              year={year}
              month={month}
              onResetPassword={onResetPassword}
              onSetMembership={onSetMembership}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DateQueryView ───────────────────────────────────────────────────────────

function DateQueryView({
  onSetMembership,
  onResetPassword,
  refreshKey,
}: {
  onSetMembership?: (userId: number, username: string, current: string) => void;
  onResetPassword?: (userId: number, username: string) => void;
  refreshKey?: number;
}) {
  const [date, setDate] = useState(todayString());
  const [data, setData] = useState<UserDayQueryDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/daily-query-stats', { params: { target_date: d } });
      setData(res.data);
    } catch {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [refreshKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (uid: number) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const totalQuestions = data.reduce((s, u) => s + u.question_count, 0);
  const activeUsers = data.filter(u => u.question_count > 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="date"
          value={date}
          max={todayString()}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={() => load(date)}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
        >
          查询
        </button>
        {!loading && data.length > 0 && (
          <>
            <div className="h-5 w-px bg-gray-200" />
            <span className="text-sm text-gray-500">
              活跃用户 <strong className="text-gray-800">{activeUsers}</strong> 人，
              合计提问 <strong className="text-gray-800">{totalQuestions}</strong> 次
            </span>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} />{error}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <List size={40} className="mx-auto mb-3 opacity-30" />
          <p>暂无数据</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 font-medium text-gray-600">用户名</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">用户等级</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">邮箱</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">当日提问数</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.map(u => (
                <React.Fragment key={u.user_id}>
                  <tr
                    className={`border-b border-gray-100 transition-colors ${u.question_count > 0 ? 'hover:bg-blue-50/30 cursor-pointer' : 'hover:bg-gray-50'}`}
                    onClick={() => u.question_count > 0 && toggle(u.user_id)}
                  >
                    <td className="px-5 py-3 font-medium text-gray-800">{u.username}</td>
                    <td className="px-5 py-3">
                      <MembershipBadge level={u.membership_level} />
                    </td>
                    <td className="px-5 py-3 text-gray-500">{u.email}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`font-bold text-lg ${u.question_count > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {u.question_count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {onSetMembership && (
                          <button
                            onClick={e => { e.stopPropagation(); onSetMembership(u.user_id, u.username, u.membership_level); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-purple-600 hover:bg-purple-50 border border-gray-200 hover:border-purple-200 rounded-lg transition-colors"
                          >
                            <Crown size={11} />
                            等级
                          </button>
                        )}
                        {onResetPassword && (
                          <button
                            onClick={e => { e.stopPropagation(); onResetPassword(u.user_id, u.username); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors"
                          >
                            <KeyRound size={11} />
                            重置密码
                          </button>
                        )}
                        {u.question_count > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); toggle(u.user_id); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors"
                          >
                            {expandedUsers.has(u.user_id) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                            会话
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedUsers.has(u.user_id) && u.conversations.length > 0 && (
                    <tr className="bg-blue-50/30 border-b border-gray-100">
                      <td colSpan={5} className="px-8 py-3">
                        <div className="space-y-1.5">
                          {u.conversations.map(conv => (
                            <div key={conv.id} className="flex items-center gap-3 text-sm bg-white rounded-lg px-3 py-2 border border-gray-100">
                              <span className="text-gray-700 font-medium truncate flex-1">
                                {conv.title || `对话 #${conv.id}`}
                              </span>
                              {conv.dify_conversation_id && (
                                <span className="shrink-0 flex items-center gap-1">
                                  <span className="text-xs text-gray-400 font-mono">ID:</span>
                                  <CopyButton text={conv.dify_conversation_id} />
                                </span>
                              )}
                              <span className="shrink-0 text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
                                {conv.question_count} 次提问
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── LeaderboardView ─────────────────────────────────────────────────────────

function LeaderboardView({
  onSetMembership,
  onResetPassword,
  refreshKey,
}: {
  onSetMembership?: (userId: number, username: string, current: string) => void;
  onResetPassword?: (userId: number, username: string) => void;
  refreshKey?: number;
}) {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/leaderboard');
      setData(res.data);
    } catch {
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = data.filter(e => {
    const matchSearch = !search.trim() || e.username.toLowerCase().includes(search.trim().toLowerCase()) || e.email.toLowerCase().includes(search.trim().toLowerCase());
    const matchMember = memberFilter === 'all' || e.membership_level === memberFilter;
    return matchSearch && matchMember;
  });

  const rankDisplay = (entry: LeaderboardEntry) => {
    if (entry.rank === 1) return <span className="text-2xl">🥇</span>;
    if (entry.rank === 2) return <span className="text-2xl">🥈</span>;
    if (entry.rank === 3) return <span className="text-2xl">🥉</span>;
    return <span className="text-sm font-bold text-gray-500">#{entry.rank}</span>;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索用户名或邮箱"
            className="pl-8 pr-8 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <XCircle size={14} />
            </button>
          )}
        </div>

        <div className="h-5 w-px bg-gray-200" />

        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Filter size={13} />
          用户等级：
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setMemberFilter('all')}
            className={`px-3 py-1 rounded-md text-xs transition-all ${memberFilter === 'all' ? 'bg-white text-gray-800 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            全部
          </button>
          {MEMBERSHIP_LEVELS.map(lv => {
            const cfg = MEMBERSHIP_CONFIG[lv];
            return (
              <button
                key={lv}
                onClick={() => setMemberFilter(lv)}
                className={`px-3 py-1 rounded-md text-xs transition-all ${memberFilter === lv ? 'bg-white text-gray-800 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {cfg.icon} {cfg.label}
              </button>
            );
          })}
        </div>

        <button onClick={load} className="px-3 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors ml-auto">
          刷新
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} />{error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Trophy size={40} className="mx-auto mb-3 opacity-30" />
          <p>暂无数据</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-center px-4 py-3 font-medium text-gray-600 w-16">排名</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">用户名</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">用户等级</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">邮箱</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">总提问数</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">注册时间</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(entry => (
                <tr key={entry.user_id} className={`hover:bg-gray-50 transition-colors ${entry.rank <= 3 ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    {rankDisplay(entry)}
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-800">{entry.username}</td>
                  <td className="px-5 py-3">
                    <MembershipBadge level={entry.membership_level} />
                  </td>
                  <td className="px-5 py-3 text-gray-500">{entry.email}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="font-bold text-xl text-blue-600">{entry.total_questions}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{formatTime(entry.created_at)}</td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {onSetMembership && (
                        <button
                          onClick={() => onSetMembership(entry.user_id, entry.username, entry.membership_level)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-purple-600 hover:bg-purple-50 border border-gray-200 hover:border-purple-200 rounded-lg transition-colors"
                        >
                          <Crown size={11} />
                          等级
                        </button>
                      )}
                      {onResetPassword && (
                        <button
                          onClick={() => onResetPassword(entry.user_id, entry.username)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors"
                        >
                          <KeyRound size={11} />
                          重置
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'messages' | 'stats'>('messages');
  const [statsView, setStatsView] = useState<'date' | 'heatmap' | 'leaderboard'>('date');
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  // Messages tab state
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgError, setMsgError] = useState('');
  const [filterMin, setFilterMin] = useState('');
  const [filterMax, setFilterMax] = useState('');
  const [appliedMin, setAppliedMin] = useState<number | null>(null);
  const [appliedMax, setAppliedMax] = useState<number | null>(null);
  const [showUnratedOnly, setShowUnratedOnly] = useState(false);
  const [convSearch, setConvSearch] = useState('');

  // 修改自身密码
  const [showAdminChangePwd, setShowAdminChangePwd] = useState(false);
  const [adminOldPwd, setAdminOldPwd] = useState('');
  const [adminNewPwd, setAdminNewPwd] = useState('');
  const [adminConfirmPwd, setAdminConfirmPwd] = useState('');
  const [adminPwdError, setAdminPwdError] = useState('');
  const [adminPwdLoading, setAdminPwdLoading] = useState(false);
  const [showAdminOldPwd, setShowAdminOldPwd] = useState(false);
  const [showAdminNewPwd, setShowAdminNewPwd] = useState(false);

  // 重置用户密码
  const [resetTarget, setResetTarget] = useState<{ userId: number; username: string } | null>(null);
  const [resetNewPwd, setResetNewPwd] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetNewPwd, setShowResetNewPwd] = useState(false);

  // 设置用户等级
  const [memberTarget, setMemberTarget] = useState<{ userId: number; username: string; current: string } | null>(null);
  const [memberLevel, setMemberLevel] = useState('free');
  const [memberError, setMemberError] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);

  const openAdminChangePwd = () => {
    setAdminOldPwd(''); setAdminNewPwd(''); setAdminConfirmPwd('');
    setAdminPwdError(''); setShowAdminOldPwd(false); setShowAdminNewPwd(false);
    setShowAdminChangePwd(true);
  };

  const handleAdminChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminNewPwd !== adminConfirmPwd) { setAdminPwdError('两次输入的新密码不一致'); return; }
    if (adminNewPwd.length < 6) { setAdminPwdError('新密码至少需要 6 位'); return; }
    setAdminPwdLoading(true); setAdminPwdError('');
    try {
      await api.post('/auth/change-password', { old_password: adminOldPwd, new_password: adminNewPwd });
      setShowAdminChangePwd(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAdminPwdError(detail || '修改失败，请稍后重试');
    } finally {
      setAdminPwdLoading(false);
    }
  };

  const openResetModal = (userId: number, username: string) => {
    setResetTarget({ userId, username });
    setResetNewPwd(''); setResetError(''); setShowResetNewPwd(false);
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetNewPwd.length < 6) { setResetError('密码至少需要 6 位'); return; }
    setResetLoading(true); setResetError('');
    try {
      await api.post(`/admin/users/${resetTarget.userId}/reset-password`, { new_password: resetNewPwd });
      setResetTarget(null);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setResetError(detail || '重置失败，请稍后重试');
    } finally {
      setResetLoading(false);
    }
  };

  const openMemberModal = (userId: number, username: string, current: string) => {
    setMemberTarget({ userId, username, current });
    setMemberLevel(current);
    setMemberError('');
  };

  const handleSetMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberTarget) return;
    setMemberLoading(true); setMemberError('');
    try {
      await api.put(`/admin/users/${memberTarget.userId}/membership`, { membership_level: memberLevel });
      setMemberTarget(null);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setMemberError(detail || '设置失败，请稍后重试');
    } finally {
      setMemberLoading(false);
    }
  };

  // Auth guard
  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/login'); return; }
      if (!user.is_admin) { router.push('/'); return; }
    }
  }, [user, loading, router]);

  const loadConversations = useCallback(async (min: number | null, max: number | null) => {
    setMsgLoading(true);
    setMsgError('');
    try {
      const params: Record<string, string> = {};
      if (min !== null) params.min_rating = String(min);
      if (max !== null) params.max_rating = String(max);
      const res = await api.get('/admin/conversations', { params });
      setConversations(res.data);
    } catch {
      setMsgError('加载失败，请重试');
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_admin && activeTab === 'messages') {
      loadConversations(appliedMin, appliedMax);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user]);

  if (loading || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  const handleApplyFilter = () => {
    const min = filterMin === '' ? null : Number(filterMin);
    const max = filterMax === '' ? null : Number(filterMax);
    setAppliedMin(min);
    setAppliedMax(max);
    loadConversations(min, max);
  };

  const handleClearFilter = () => {
    setFilterMin(''); setFilterMax('');
    setAppliedMin(null); setAppliedMax(null);
    setShowUnratedOnly(false);
    loadConversations(null, null);
  };

  const handleToggleUnrated = () => {
    const next = !showUnratedOnly;
    setShowUnratedOnly(next);
    if (next) { setFilterMin(''); setFilterMax(''); setAppliedMin(null); setAppliedMax(null); }
  };

  const isFilterActive = appliedMin !== null || appliedMax !== null || showUnratedOnly;

  const filteredConversations = convSearch.trim()
    ? conversations.filter(c => c.dify_conversation_id?.toLowerCase().includes(convSearch.trim().toLowerCase()))
    : conversations;

  const totalConvs = conversations.length;
  const totalMessages = conversations.reduce((s, c) => s + c.messages.length, 0);
  const ratedMessages = conversations.reduce((s, c) => s + c.messages.filter(m => m.feedback).length, 0);
  const avgRating = (() => {
    const ratings = conversations.flatMap(c => c.messages.map(m => m.feedback?.rating).filter(Boolean) as number[]);
    if (!ratings.length) return null;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  })();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-800">管理后台</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              你好，<span className="font-medium text-blue-600">{user.username}</span>！
            </span>
            <button
              onClick={openAdminChangePwd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <KeyRound size={14} />
              修改密码
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <LogOut size={14} />
              退出登录
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Main Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          <button
            onClick={() => { setActiveTab('messages'); loadConversations(appliedMin, appliedMax); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'messages' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {msgLoading && activeTab === 'messages'
              ? <RefreshCw size={15} className="animate-spin" />
              : <MessageSquare size={15} />}
            消息管理
          </button>
          <button
            onClick={() => { setActiveTab('stats'); setStatsRefreshKey(k => k + 1); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'stats' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Users size={15} />
            用户统计
          </button>
        </div>

        {/* ── Messages Tab ── */}
        {activeTab === 'messages' && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: '对话总数', value: totalConvs },
                { label: '消息总数', value: totalMessages },
                { label: '已评分消息', value: ratedMessages },
                { label: '平均评分', value: avgRating ?? '—' },
              ].map(item => (
                <div key={item.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className="text-2xl font-bold text-gray-800">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-5 shadow-sm flex flex-wrap items-center gap-3">
              <div className="relative w-64">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={convSearch}
                  onChange={e => setConvSearch(e.target.value)}
                  placeholder="搜索 Conversation ID"
                  className={`w-full pl-8 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${convSearch ? 'pr-7' : 'pr-3'}`}
                />
                {convSearch && (
                  <button onClick={() => setConvSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <XCircle size={14} />
                  </button>
                )}
              </div>

              <div className="h-5 w-px bg-gray-200" />

              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Filter size={14} className="shrink-0" />
                <span className="whitespace-nowrap">按评分筛选</span>
              </div>
              <div className={`flex items-center gap-2 transition-opacity ${showUnratedOnly ? 'opacity-30 pointer-events-none' : ''}`}>
                <input
                  type="number" min={1} max={10} value={filterMin} disabled={showUnratedOnly}
                  onChange={e => setFilterMin(e.target.value)} placeholder="最低"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
                />
                <span className="text-sm text-gray-400">–</span>
                <input
                  type="number" min={1} max={10} value={filterMax} disabled={showUnratedOnly}
                  onChange={e => setFilterMax(e.target.value)} placeholder="最高"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
                />
              </div>

              <label className={`flex items-center gap-1.5 select-none text-sm transition-opacity ${filterMin || filterMax ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer text-gray-500'}`}>
                <input type="checkbox" checked={showUnratedOnly} onChange={handleToggleUnrated} disabled={!!(filterMin || filterMax)} className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed" />
                仅看未评价
              </label>

              <div className="h-5 w-px bg-gray-200" />

              <button onClick={handleApplyFilter} disabled={showUnratedOnly} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                应用
              </button>
              {isFilterActive && (
                <button onClick={handleClearFilter} className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  清除
                </button>
              )}
              {convSearch && (
                <span className="text-sm text-blue-600 font-medium whitespace-nowrap">{filteredConversations.length} 条</span>
              )}
            </div>

            {msgLoading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
              </div>
            ) : msgError ? (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={16} />{msgError}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
                <p>{convSearch ? '未找到匹配的对话 ID' : '暂无符合条件的对话'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredConversations.map(conv => (
                  <ConversationCard
                    key={conv.id}
                    conv={conv}
                    filterMin={appliedMin}
                    filterMax={appliedMax}
                    showUnratedOnly={showUnratedOnly}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Stats Tab ── */}
        {activeTab === 'stats' && (
          <div>
            <div className="flex gap-1 mb-5 bg-white border border-gray-200 rounded-lg p-1 w-fit shadow-sm">
              <button
                onClick={() => setStatsView('date')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  statsView === 'date' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <List size={14} />
                按日期
              </button>
              <button
                onClick={() => setStatsView('heatmap')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  statsView === 'heatmap' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Calendar size={14} />
                提问日历
              </button>
              <button
                onClick={() => setStatsView('leaderboard')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  statsView === 'leaderboard' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <TrendingUp size={14} />
                总榜
              </button>
            </div>

            {statsView === 'date' && (
              <DateQueryView onSetMembership={openMemberModal} onResetPassword={openResetModal} refreshKey={statsRefreshKey} />
            )}
            {statsView === 'heatmap' && (
              <HeatmapView onSetMembership={openMemberModal} onResetPassword={openResetModal} refreshKey={statsRefreshKey} />
            )}
            {statsView === 'leaderboard' && (
              <LeaderboardView onSetMembership={openMemberModal} onResetPassword={openResetModal} refreshKey={statsRefreshKey} />
            )}
          </div>
        )}
      </div>

      {/* ── 修改自身密码弹窗 ── */}
      {showAdminChangePwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">修改密码</h2>
              <button onClick={() => setShowAdminChangePwd(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {adminPwdError && (
              <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{adminPwdError}</div>
            )}
            <form onSubmit={handleAdminChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">当前密码</label>
                <div className="relative">
                  <input type={showAdminOldPwd ? 'text' : 'password'} required value={adminOldPwd} onChange={e => setAdminOldPwd(e.target.value)} placeholder="请输入当前密码"
                    className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                  <button type="button" onClick={() => setShowAdminOldPwd(!showAdminOldPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showAdminOldPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">新密码</label>
                <div className="relative">
                  <input type={showAdminNewPwd ? 'text' : 'password'} required value={adminNewPwd} onChange={e => setAdminNewPwd(e.target.value)} placeholder="至少 6 位"
                    className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                  <button type="button" onClick={() => setShowAdminNewPwd(!showAdminNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showAdminNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">确认新密码</label>
                <input type="password" required value={adminConfirmPwd} onChange={e => setAdminConfirmPwd(e.target.value)} placeholder="再次输入新密码"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAdminChangePwd(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">取消</button>
                <button type="submit" disabled={adminPwdLoading} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-all">
                  {adminPwdLoading ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 重置用户密码弹窗 ── */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">重置密码</h2>
              <button onClick={() => setResetTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              正在为用户 <span className="font-medium text-gray-800">{resetTarget.username}</span> 设置新密码
            </p>
            {resetError && (
              <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{resetError}</div>
            )}
            <form onSubmit={handleResetUserPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">新密码</label>
                <div className="relative">
                  <input type={showResetNewPwd ? 'text' : 'password'} required value={resetNewPwd} onChange={e => setResetNewPwd(e.target.value)} placeholder="至少 6 位"
                    className="w-full px-4 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all" />
                  <button type="button" onClick={() => setShowResetNewPwd(!showResetNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showResetNewPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setResetTarget(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">取消</button>
                <button type="submit" disabled={resetLoading} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-all">
                  {resetLoading ? '提交中...' : '确认重置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 设置用户等级弹窗 ── */}
      {memberTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">设置用户等级</h2>
              <button onClick={() => setMemberTarget(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              为用户 <span className="font-medium text-gray-800">{memberTarget.username}</span> 设置用户等级
            </p>
            {memberError && (
              <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">{memberError}</div>
            )}
            <form onSubmit={handleSetMembership} className="space-y-4">
              <div className="space-y-2">
                {MEMBERSHIP_LEVELS.map(lv => {
                  const cfg = MEMBERSHIP_CONFIG[lv];
                  return (
                    <label key={lv} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      memberLevel === lv ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-gray-100 hover:border-gray-200 text-gray-600'
                    }`}>
                      <input
                        type="radio"
                        name="membership"
                        value={lv}
                        checked={memberLevel === lv}
                        onChange={() => setMemberLevel(lv)}
                        className="sr-only"
                      />
                      <span className="text-lg">{cfg.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{cfg.label}</p>
                      </div>
                      {memberLevel === lv && <Check size={16} className={cfg.color} />}
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setMemberTarget(null)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors">取消</button>
                <button type="submit" disabled={memberLoading} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-all">
                  {memberLoading ? '提交中...' : '确认设置'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
