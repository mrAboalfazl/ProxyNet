'use client';

import React from 'react';

// ── Tokens ────────────────────────────────────────────────────────────────
export const colors = {
  navy: '#1a2744',
  navyLight: 'rgba(255,255,255,0.08)',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  dangerBorder: '#fca5a5',
  surface: '#ffffff',
  bg: '#f3f4f6',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  textNav: '#b0bedd',
};

// ── Card ──────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        backgroundColor: colors.surface,
        borderRadius: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────
export function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card style={{ padding: '24px 32px', flex: 1, minWidth: 160 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 32, fontWeight: 700, color: color || colors.navy }}>{value}</p>
    </Card>
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
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: React.CSSProperties;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: 'none',
    borderRadius: 6,
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontSize: size === 'sm' ? 13 : 14,
    padding: size === 'sm' ? '6px 12px' : '9px 16px',
    transition: 'background 0.15s',
    ...style,
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: colors.primary, color: '#fff' },
    secondary: { backgroundColor: '#e5e7eb', color: '#374151' },
    danger: { backgroundColor: colors.danger, color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: colors.primary, border: `1px solid ${colors.primary}` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────
const badgeMap: Record<string, { bg: string; color: string }> = {
  healthy: { bg: '#dcfce7', color: '#166534' },
  active: { bg: '#dbeafe', color: '#1e40af' },
  degraded: { bg: '#fef9c3', color: '#854d0e' },
  inactive: { bg: '#f3f4f6', color: '#374151' },
  suspended: { bg: '#fee2e2', color: '#991b1b' },
  banned: { bg: '#fce7f3', color: '#9d174d' },
  true: { bg: '#dcfce7', color: '#166534' },
  false: { bg: '#f3f4f6', color: '#374151' },
};

export function Badge({ label }: { label: string }) {
  const style = badgeMap[label.toLowerCase()] ?? { bg: '#f3f4f6', color: '#374151' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      {label}
    </span>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '10px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <tr
      style={{
        borderBottom: `1px solid ${colors.border}`,
        transition: 'background 0.1s',
        ...style,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#f9fafb'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
    >
      {children}
    </tr>
  );
}

export function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '12px 16px', color: colors.text, ...style }}>{children}</td>
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
  style,
}: {
  label?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          padding: '8px 12px',
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          fontSize: 14,
          outline: 'none',
          transition: 'border 0.15s',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = colors.primary; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = colors.border; }}
      />
    </div>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────
export function Alert({ message, type = 'error' }: { message: string; type?: 'error' | 'success' | 'info' }) {
  const styles = {
    error: { bg: colors.dangerBg, border: colors.dangerBorder, color: '#b91c1c' },
    success: { bg: '#dcfce7', border: '#86efac', color: '#166534' },
    info: { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af' },
  };
  const s = styles[type];
  return (
    <div
      style={{
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 8,
        padding: '12px 16px',
        color: s.color,
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: 24,
          minWidth: 400,
          maxWidth: 560,
          width: '90%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: colors.text }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: colors.textMuted,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: colors.text }}>{title}</h1>
      {action}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div
        style={{
          width: 32,
          height: 32,
          border: `3px solid ${colors.border}`,
          borderTopColor: colors.primary,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
