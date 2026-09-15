'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import React from 'react';
import { cn } from '../lib/utils';

export const colors = {
  navy: '#172554', primary: '#2563eb', primaryHover: '#1d4ed8',
  success: '#16a34a', warning: '#d97706', danger: '#dc2626',
  dangerBg: '#fee2e2', dangerBorder: '#fca5a5', surface: '#ffffff',
  bg: '#f8fafc', border: '#e2e8f0', text: '#0f172a', textMuted: '#64748b', textNav: '#cbd5e1',
};

type StyledProps = { children: React.ReactNode; className?: string; style?: React.CSSProperties };

export function Card({ children, className, style }: StyledProps) {
  return <section className={cn('user-card', className)} style={style}>{children}</section>;
}

export function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return <Card className="user-stat-card"><p>{label}</p><strong style={color ? { color } : undefined}>{value}</strong></Card>;
}

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style, className }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md'; disabled?: boolean; type?: 'button' | 'submit'; style?: React.CSSProperties; className?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} style={style} className={cn('user-button', `user-button--${variant}`, `user-button--${size}`, className)}>{children}</button>;
}

const badgeMap: Record<string, string> = { healthy: 'success', active: 'info', enabled: 'success', degraded: 'warning', inactive: 'muted', disabled: 'muted', suspended: 'danger', banned: 'danger', true: 'success', false: 'muted' };
export function Badge({ label }: { label: string }) {
  return <span className={cn('user-badge', `user-badge--${badgeMap[label.toLowerCase()] ?? 'muted'}`)}>{label}</span>;
}

export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="user-table-wrap"><table className="user-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function Tr({ children, style }: StyledProps) { return <tr style={style}>{children}</tr>; }
export function Td({ children, style }: StyledProps) { return <td style={style}>{children}</td>; }

export function Input({ label, type = 'text', value, onChange, placeholder, required, style }: {
  label?: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; style?: React.CSSProperties;
}) {
  return <label className="user-field" style={style}>{label && <span>{label}</span>}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></label>;
}

export function Alert({ message, type = 'error' }: { message: string; type?: 'error' | 'success' | 'info' }) {
  return <div className={cn('user-alert', `user-alert--${type}`)} role="alert">{message}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <Dialog.Root open onOpenChange={(open) => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="user-dialog-overlay" /><Dialog.Content className="user-dialog-content" dir="inherit">
    <div className="user-dialog-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><button className="user-icon-button" aria-label="Close"><X size={18} /></button></Dialog.Close></div>
    {children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return <header className="user-page-header"><div><h1>{title}</h1></div>{action && <div className="user-page-header-action">{action}</div>}</header>;
}

export function Spinner() { return <div className="user-spinner-wrap" aria-live="polite"><span className="user-spinner" /><span className="sr-only">Loading</span></div>; }

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={250}><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content className="user-tooltip" sideOffset={7}>{content}<TooltipPrimitive.Arrow className="user-tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></TooltipPrimitive.Provider>;
}
