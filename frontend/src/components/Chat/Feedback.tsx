'use client';

import React, { useState } from 'react';
import { Edit2, Check, X, Star } from 'lucide-react';
import api from '@/lib/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FeedbackProps {
  messageId: number;
  initialRating?: number;
  initialComment?: string;
  onSubmitted?: () => void;
}

const Feedback: React.FC<FeedbackProps> = ({ messageId, initialRating = 0, initialComment = '', onSubmitted }) => {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [savedRating, setSavedRating] = useState(initialRating);
  const [savedComment, setSavedComment] = useState(initialComment);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(initialRating > 0);
  const [isEditing, setIsEditing] = useState(initialRating === 0);
  // 未提交时是否折叠成小按钮
  const [collapsed, setCollapsed] = useState(false);

  const submitFeedback = async () => {
    if (!rating) return;
    setIsSubmitting(true);
    try {
      await api.post('/feedback', {
        message_id: messageId,
        rating: rating,
        comment: comment,
      });
      setSavedRating(rating);
      setSavedComment(comment);
      setIsSubmitted(true);
      setIsEditing(false);
      onSubmitted?.();
    } catch (error) {
      console.error('Failed to submit feedback', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 已提交：显示评分摘要 + 修改按钮
  if (isSubmitted && !isEditing) {
    return (
      <div className="mt-1 group relative flex items-center gap-3 bg-gray-50 hover:bg-gray-100/80 px-3 py-2 rounded-xl border border-gray-200/80 transition-colors w-fit min-w-[180px] max-w-full">
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">评分</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-md text-[11px] font-semibold",
              rating >= 8 ? "bg-green-100 text-green-700" :
              rating >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
            )}>
              {rating} / 10
            </span>
          </div>
          {savedComment && (
            <p className="text-xs text-gray-600 break-words">{savedComment}</p>
          )}
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white rounded-lg border border-gray-200 shadow-sm absolute -right-2 -top-2"
          title="修改评价"
        >
          <Edit2 size={12} />
        </button>
      </div>
    );
  }

  // 折叠状态：小按钮
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-xl transition-all"
      >
        <Star size={12} />
        为回复评分
      </button>
    );
  }

  // 展开的评分表单
  return (
    <div className="mt-1 relative flex flex-col gap-3 bg-white px-4 py-3.5 rounded-xl border border-gray-200 shadow-sm w-fit max-w-full">
      {/* 右上角关闭按钮 */}
      <button
        onClick={() => {
          if (isEditing && isSubmitted) {
            setRating(savedRating);
            setComment(savedComment);
            setIsEditing(false);
          } else {
            setCollapsed(true);
          }
        }}
        className="absolute right-2 top-2 p-0.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
        title="收起"
      >
        <X size={13} />
      </button>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide pr-4">
          {isEditing && isSubmitted ? '修改评分' : '为回复评分'} <span className="normal-case">(1–10)</span>
        </span>
        <div className="flex items-center gap-1 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <button
              key={num}
              onClick={() => setRating(num)}
              className={cn(
                "w-7 h-7 rounded-lg text-xs font-medium transition-all border flex items-center justify-center",
                rating === num
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-500 border-gray-200 hover:border-blue-400 hover:text-blue-500"
              )}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="说说你的想法（可选）..."
        className="text-xs px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-gray-50 resize-none min-h-[52px] placeholder:text-gray-400 transition-all"
        rows={2}
      />

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={submitFeedback}
          disabled={isSubmitting || rating === 0}
          className="text-xs bg-blue-600 text-white py-1.5 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium shadow-sm"
        >
          {isSubmitting ? (
            <span className="animate-pulse">提交中...</span>
          ) : (
            <>
              <Check size={13} />
              {isEditing && isSubmitted ? '保存修改' : '提交评价'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Feedback;
