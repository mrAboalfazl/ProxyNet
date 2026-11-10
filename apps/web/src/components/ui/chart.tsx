'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

export interface DataPoint {
  time: string;
  requests: number;
  bandwidthMb: number;
  revenueToman?: number;
}

export function UsageAreaChart({
  data,
  height = 240,
}: {
  data: DataPoint[];
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorReq" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorBw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              color: '#fff',
              fontSize: 12,
            }}
            itemStyle={{ color: '#fff', padding: '2px 0' }}
          />
          <Area
            type="monotone"
            dataKey="requests"
            name="درخواست‌ها / Requests"
            stroke="#3b82f6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorReq)"
          />
          <Area
            type="monotone"
            dataKey="bandwidthMb"
            name="حجم (MB) / Bandwidth"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorBw)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart({
  data,
  height = 200,
}: {
  data: { name: string; value: number; fill?: string }[];
  height?: number;
}) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0f172a',
              borderRadius: 8,
              border: 'none',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              color: '#fff',
              fontSize: 12,
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
