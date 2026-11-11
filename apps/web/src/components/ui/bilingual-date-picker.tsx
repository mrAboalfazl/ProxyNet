'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  JALALI_MONTHS_FA,
  JALALI_WEEKDAYS_FA,
  GREGORIAN_MONTHS_EN,
  GREGORIAN_WEEKDAYS_EN,
  gregorianToJalali,
  jalaliToGregorian,
  getDaysInJalaliMonth,
  getDaysInGregorianMonth,
  formatDate,
  toPersianDigits,
} from '@/lib/jalali';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BilingualDatePickerProps {
  value?: string; // ISO date 'YYYY-MM-DD'
  onChange: (isoDate: string) => void;
  lang?: string; // 'fa' | 'en'
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
}

export function BilingualDatePicker({
  value,
  onChange,
  lang = 'fa',
  placeholder,
  className,
  disabled = false,
  clearable = true,
}: BilingualDatePickerProps) {
  const isFa = lang === 'fa';
  const isRTL = isFa;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close calendar popover on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [open]);

  // Current view state (Year and Month being viewed)
  const today = useMemo(() => new Date(), []);
  const todayJalali = useMemo(
    () => gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate()),
    [today]
  );

  // Parse currently selected value
  const parsedValue = useMemo(() => {
    if (!value) return null;
    const parts = value.split('-');
    if (parts.length !== 3) return null;
    const gy = parseInt(parts[0], 10);
    const gm = parseInt(parts[1], 10);
    const gd = parseInt(parts[2], 10);
    if (isNaN(gy) || isNaN(gm) || isNaN(gd)) return null;
    return {
      gy,
      gm,
      gd,
      jalali: gregorianToJalali(gy, gm, gd),
    };
  }, [value]);

  // Viewed Year and Month in the calendar
  const [viewJalali, setViewJalali] = useState(() => ({
    year: parsedValue?.jalali.jy ?? todayJalali.jy,
    month: parsedValue?.jalali.jm ?? todayJalali.jm,
  }));

  const [viewGregorian, setViewGregorian] = useState(() => ({
    year: parsedValue?.gy ?? today.getFullYear(),
    month: parsedValue?.gm ?? today.getMonth() + 1,
  }));

  // Sync view when opened
  useEffect(() => {
    if (open) {
      if (parsedValue) {
        setViewJalali({ year: parsedValue.jalali.jy, month: parsedValue.jalali.jm });
        setViewGregorian({ year: parsedValue.gy, month: parsedValue.gm });
      } else {
        setViewJalali({ year: todayJalali.jy, month: todayJalali.jm });
        setViewGregorian({ year: today.getFullYear(), month: today.getMonth() + 1 });
      }
    }
  }, [open, parsedValue, todayJalali, today]);

  // Navigation handlers
  function prevMonth() {
    if (isFa) {
      setViewJalali((prev) => {
        if (prev.month === 1) return { year: prev.year - 1, month: 12 };
        return { ...prev, month: prev.month - 1 };
      });
    } else {
      setViewGregorian((prev) => {
        if (prev.month === 1) return { year: prev.year - 1, month: 12 };
        return { ...prev, month: prev.month - 1 };
      });
    }
  }

  function nextMonth() {
    if (isFa) {
      setViewJalali((prev) => {
        if (prev.month === 12) return { year: prev.year + 1, month: 1 };
        return { ...prev, month: prev.month + 1 };
      });
    } else {
      setViewGregorian((prev) => {
        if (prev.month === 12) return { year: prev.year + 1, month: 1 };
        return { ...prev, month: prev.month + 1 };
      });
    }
  }

  // Days matrix calculation
  const calendarDays = useMemo(() => {
    if (isFa) {
      const daysCount = getDaysInJalaliMonth(viewJalali.year, viewJalali.month);
      // Determine what weekday the 1st of this Jalali month is
      const gFirst = jalaliToGregorian(viewJalali.year, viewJalali.month, 1);
      const dFirst = new Date(gFirst.gy, gFirst.gm - 1, gFirst.gd);
      // In Jalali: Saturday is 0 offset
      const startOffset = (dFirst.getDay() + 1) % 7;

      const days: Array<{ day: number; isCurrentMonth: boolean }> = [];
      for (let i = 0; i < startOffset; i++) {
        days.push({ day: 0, isCurrentMonth: false });
      }
      for (let d = 1; d <= daysCount; d++) {
        days.push({ day: d, isCurrentMonth: true });
      }
      return days;
    } else {
      const daysCount = getDaysInGregorianMonth(viewGregorian.year, viewGregorian.month);
      const dFirst = new Date(viewGregorian.year, viewGregorian.month - 1, 1);
      const startOffset = dFirst.getDay(); // Sunday = 0

      const days: Array<{ day: number; isCurrentMonth: boolean }> = [];
      for (let i = 0; i < startOffset; i++) {
        days.push({ day: 0, isCurrentMonth: false });
      }
      for (let d = 1; d <= daysCount; d++) {
        days.push({ day: d, isCurrentMonth: true });
      }
      return days;
    }
  }, [isFa, viewJalali, viewGregorian]);

  function handleSelectDay(day: number) {
    if (day <= 0) return;
    if (isFa) {
      const g = jalaliToGregorian(viewJalali.year, viewJalali.month, day);
      const iso = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
      onChange(iso);
    } else {
      const iso = `${viewGregorian.year}-${String(viewGregorian.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      onChange(iso);
    }
    setOpen(false);
  }

  function handleSelectToday() {
    const gy = today.getFullYear();
    const gm = String(today.getMonth() + 1).padStart(2, '0');
    const gd = String(today.getDate()).padStart(2, '0');
    onChange(`${gy}-${gm}-${gd}`);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setOpen(false);
  }

  // Display text in input
  const displayText = value ? formatDate(value, lang, { format: 'medium' }) : '';
  const defaultPlaceholder = isFa ? 'انتخاب تاریخ...' : 'Select date...';

  return (
    <div className={cn('relative inline-block w-full', className)} ref={containerRef}>
      {/* Input Trigger Button */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          'w-full h-9 flex items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors cursor-pointer select-none',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-muted/30',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={cn('truncate', !displayText && 'text-muted-foreground')}>
            {displayText || placeholder || defaultPlaceholder}
          </span>
        </div>
        {clearable && value && !disabled && (
          <span
            onClick={handleClear}
            className="p-0.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            title={isFa ? 'پاک کردن' : 'Clear'}
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {/* Floating Calendar Popover */}
      {open && (
        <div
          dir={isRTL ? 'rtl' : 'ltr'}
          className={cn(
            'absolute z-50 mt-1 w-64 rounded-xl border border-border/80 bg-popover text-popover-foreground p-3 shadow-xl animate-in fade-in-0 zoom-in-95',
            isRTL ? 'right-0' : 'left-0'
          )}
        >
          {/* Header Controls (Month/Year selector and prev/next buttons) */}
          <div className="flex items-center justify-between gap-1 mb-3">
            <button
              type="button"
              onClick={isRTL ? nextMonth : prevMonth}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={isFa ? 'ماه قبل' : 'Previous Month'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="text-xs font-bold text-foreground">
              {isFa ? (
                <span>
                  {JALALI_MONTHS_FA[viewJalali.month - 1]} {toPersianDigits(viewJalali.year)}
                </span>
              ) : (
                <span>
                  {GREGORIAN_MONTHS_EN[viewGregorian.month - 1]} {viewGregorian.year}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={isRTL ? prevMonth : nextMonth}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={isFa ? 'ماه بعد' : 'Next Month'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground mb-1.5">
            {(isFa ? JALALI_WEEKDAYS_FA : GREGORIAN_WEEKDAYS_EN).map((w, idx) => (
              <div key={idx} className="h-6 flex items-center justify-center">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((d, idx) => {
              if (!d.isCurrentMonth) {
                return <div key={idx} className="h-7 w-7" />;
              }

              const isSelected = isFa
                ? parsedValue?.jalali.jy === viewJalali.year &&
                  parsedValue?.jalali.jm === viewJalali.month &&
                  parsedValue?.jalali.jd === d.day
                : parsedValue?.gy === viewGregorian.year &&
                  parsedValue?.gm === viewGregorian.month &&
                  parsedValue?.gd === d.day;

              const isToday = isFa
                ? todayJalali.jy === viewJalali.year &&
                  todayJalali.jm === viewJalali.month &&
                  todayJalali.jd === d.day
                : today.getFullYear() === viewGregorian.year &&
                  today.getMonth() + 1 === viewGregorian.month &&
                  today.getDate() === d.day;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDay(d.day)}
                  className={cn(
                    'h-7 w-7 rounded-md text-xs font-medium flex items-center justify-center transition-all',
                    isSelected
                      ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                      : isToday
                      ? 'border border-primary text-primary hover:bg-primary/10'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  {isFa ? toPersianDigits(d.day) : d.day}
                </button>
              );
            })}
          </div>

          {/* Quick Action Footer */}
          <div className="flex items-center justify-between border-t border-border/60 mt-3 pt-2 text-[11px]">
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-primary hover:underline font-semibold"
            >
              {isFa ? 'امروز' : 'Today'}
            </button>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-destructive"
              >
                {isFa ? 'پاک کردن' : 'Clear'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
