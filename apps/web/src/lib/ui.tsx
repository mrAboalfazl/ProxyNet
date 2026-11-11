'use client';

import React from 'react';
import { cn } from './utils';
import {
  Card as ShadCard,
  CardHeader as ShadCardHeader,
  CardTitle as ShadCardTitle,
  CardDescription as ShadCardDescription,
  CardContent as ShadCardContent,
  CardFooter as ShadCardFooter,
} from '@/components/ui/card';
import { Button as ShadButton } from '@/components/ui/button';
import { Badge as ShadBadge } from '@/components/ui/badge';
import {
  Table as ShadTable,
  TableHeader as ShadTableHeader,
  TableRow as ShadTableRow,
  TableHead as ShadTableHead,
  TableBody as ShadTableBody,
  TableCell as ShadTableCell,
} from '@/components/ui/table';
import { Input as ShadInput } from '@/components/ui/input';
import { Label as ShadLabel } from '@/components/ui/label';
import { Alert as ShadAlert, AlertDescription as ShadAlertDesc } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
export { Pagination, usePagination } from '@/components/ui/pagination';
export { BilingualDatePicker } from '@/components/ui/bilingual-date-picker';
export { formatDate, formatDateTime, toPersianDigits } from './jalali';

// ── Legacy Design Tokens for Backwards Compatibility ────────────────────────
export const colors = {
  navy: '#0f172a',
  navyLight: 'rgba(255,255,255,0.08)',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  dangerBorder: '#fca5a5',
  surface: '#ffffff',
  bg: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  textNav: '#94a3b8',
};

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <ShadCard
      className={cn('transition-all duration-200 border-border/80 shadow-sm hover:shadow', className)}
      style={style}
    >
      {children}
    </ShadCard>
  );
}

export {
  ShadCardHeader as CardHeader,
  ShadCardTitle as CardTitle,
  ShadCardDescription as CardDescription,
  ShadCardContent as CardContent,
  ShadCardFooter as CardFooter,
};

// ── StatCard ──────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  color,
  icon: Icon,
  description,
  className,
  style,
}: {
  label: string;
  value: string | number;
  color?: string;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  description?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <ShadCard
      className={cn('p-5 flex-1 min-w-[200px] border-border/70 hover:border-primary/40 transition-all', className)}
      style={style}
    >
      <div className="flex items-center justify-between space-y-0 pb-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold tracking-tight" style={color ? { color } : undefined}>
          {value}
        </div>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </ShadCard>
  );
}

// ── Button ────────────────────────────────────────────────────────────────
export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  className,
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  style?: React.CSSProperties;
}) {
  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline'> = {
    primary: 'default',
    secondary: 'secondary',
    danger: 'destructive',
    ghost: 'ghost',
    outline: 'outline',
  };

  const sizeMap: Record<string, 'sm' | 'default' | 'lg'> = {
    sm: 'sm',
    md: 'default',
    lg: 'lg',
  };

  return (
    <ShadButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={variantMap[variant] || 'default'}
      size={sizeMap[size] || 'default'}
      className={cn('gap-2 font-medium transition-all select-none', className)}
      style={style}
    >
      {children}
    </ShadButton>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────
const badgeVariantMap: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  healthy: 'success',
  active: 'success',
  enabled: 'success',
  true: 'success',
  degraded: 'warning',
  warning: 'warning',
  suspended: 'destructive',
  banned: 'destructive',
  inactive: 'secondary',
  disabled: 'secondary',
  false: 'secondary',
};

export function Badge({
  label,
  variant,
  className,
}: {
  label: string;
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';
  className?: string;
}) {
  const chosenVariant = variant ?? badgeVariantMap[label.toLowerCase()] ?? 'secondary';
  return (
    <ShadBadge variant={chosenVariant} className={cn('px-2.5 py-0.5 font-medium text-xs', className)}>
      {label}
    </ShadBadge>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────
export function Table({
  headers,
  children,
  className,
}: {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border/80 overflow-hidden bg-card', className)}>
      <ShadTable>
        <ShadTableHeader>
          <ShadTableRow className="bg-muted/40 hover:bg-muted/40">
            {headers.map((h, i) => (
              <ShadTableHead
                key={i}
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap py-3 px-4"
              >
                {h}
              </ShadTableHead>
            ))}
          </ShadTableRow>
        </ShadTableHeader>
        <ShadTableBody>{children}</ShadTableBody>
      </ShadTable>
    </div>
  );
}

export function Tr({
  children,
  className,
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <ShadTableRow
      className={cn('transition-colors hover:bg-muted/50 cursor-default', className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </ShadTableRow>
  );
}

export function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <ShadTableCell className={cn('py-3 px-4 text-sm align-middle', className)} style={style}>
      {children}
    </ShadTableCell>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────
export function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  hint,
  disabled,
  className,
  style,
  dir,
}: {
  label?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  dir?: 'ltr' | 'rtl' | 'auto';
}) {
  const id = React.useId();
  return (
    <div className={cn('grid gap-1.5', className)} style={style}>
      {label && (
        <ShadLabel htmlFor={id} className="text-xs font-semibold text-foreground/90">
          {label}
          {required && <span className="text-destructive ms-1">*</span>}
        </ShadLabel>
      )}
      <ShadInput
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        dir={dir}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────
export function Alert({
  message,
  type = 'error',
  title,
  className,
}: {
  message: string;
  type?: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  className?: string;
}) {
  const variantMap: Record<string, 'destructive' | 'success' | 'info' | 'warning'> = {
    error: 'destructive',
    success: 'success',
    info: 'info',
    warning: 'warning',
  };

  const Icon =
    type === 'error'
      ? AlertCircle
      : type === 'success'
      ? CheckCircle2
      : Info;

  return (
    <ShadAlert variant={variantMap[type]} className={cn('my-2', className)}>
      <Icon className="h-4 w-4" />
      {title && <div className="font-semibold text-sm mb-1">{title}</div>}
      <ShadAlertDesc className="text-sm">{message}</ShadAlertDesc>
    </ShadAlert>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────
export function Modal({
  title,
  description,
  onClose,
  children,
  open = true,
  className,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  open?: boolean;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn('sm:max-w-[540px] p-6 shadow-xl border-border/80', className)}>
        <DialogHeader className="pb-3 border-b border-border/50">
          <DialogTitle className="text-lg font-bold tracking-tight text-foreground">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="pt-3">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/60 mb-6',
        className
      )}
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────
export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
    </div>
  );
}
