"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/utils";

const AXIS = { stroke: "#5b6478", fontSize: 11 };
const GRID = "#202634";

const tooltipStyle = {
  backgroundColor: "#141821",
  border: "1px solid #202634",
  borderRadius: 10,
  fontSize: 12,
  color: "#e8ecf1",
} as const;

/** Recharts hands formatters a loose value type; coerce before formatting. */
type Valueish = string | number | readonly (string | number)[] | undefined;

const num = (v: Valueish): number => {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : 0;
};

/* ─────────────────────────── daily signups ─────────────────────────── */

export function DailySignupsChart({
  data,
}: {
  data: { label: string; teams: number; cumulative: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gradTeams" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#7d8799" }}
          formatter={(v, name) => [formatNumber(num(v)), name === "teams" ? "New teams" : "Total"]}
        />
        <Area
          type="monotone"
          dataKey="teams"
          name="teams"
          stroke="#22d3ee"
          strokeWidth={2}
          fill="url(#gradTeams)"
        />
        <Line type="monotone" dataKey="cumulative" name="cumulative" stroke="#8b95a8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ────────────────────────── track distribution ─────────────────────── */

const TRACK_COLORS = ["#22d3ee", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#fb923c"];

export function TrackBarChart({ data }: { data: { name: string; teams: number; capacity: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="teams" name="Teams" radius={[4, 4, 0, 0]} maxBarSize={46}>
          {data.map((_, i) => (
            <Cell key={i} fill={TRACK_COLORS[i % TRACK_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrackDonut({ data }: { data: { name: string; teams: number }[] }) {
  const total = data.reduce((s, d) => s + d.teams, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="teams"
            nameKey="name"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={TRACK_COLORS[i % TRACK_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{formatNumber(total)}</span>
        <span className="text-xs text-muted-foreground">teams</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── team size mix ─────────────────────────── */

export function TeamSizeChart({ data }: { data: { size: number; teams: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey="size"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v} ppl`}
        />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [formatNumber(num(v)), "Teams"]}
          labelFormatter={(v) => `${num(v as Valueish)} members`}
        />
        <Bar dataKey="teams" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ──────────────────────── communication funnel ─────────────────────── */

export function DeliveryChart({ data }: { data: { label: string; value: number }[] }) {
  const COLORS = ["#22d3ee", "#34d399", "#a78bfa", "#fbbf24", "#f2555a"];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} layout="vertical">
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={72} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────── judging spread ────────────────────────── */

export function ScoreSpreadChart({
  data,
}: {
  data: { name: string; agenticCapability: number; innovation: number; technicalImplementation: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 10]} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#7d8799" }} />
        <Line type="monotone" dataKey="agenticCapability" name="Agentic" stroke="#22d3ee" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="innovation" name="Innovation" stroke="#34d399" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="technicalImplementation" name="Technical" stroke="#a78bfa" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
