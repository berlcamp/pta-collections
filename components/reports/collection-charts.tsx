"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/financial/money";
import { moneyAxisTick, moneyBarLabel } from "@/lib/financial/chart-format";
import { formatDate, formatMonth } from "@/lib/utils/dates";

interface DailyRow {
  collection_date: string;
  payment_method: string;
  total: number;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank transfer",
  other: "Other",
};

/**
 * Shared chrome. Grid and axes stay recessive; the mark carries the meaning.
 *
 * Enter animations are disabled on every series: this is an accounting screen
 * (v1 spec §45, "avoid unnecessary animations"), and a treasurer reloading a
 * report should see the final figure immediately rather than watch it grow.
 */
const GRID = "var(--viz-grid)";
const SERIES = "var(--viz-series-1)";
const AXIS_TICK = { fontSize: 11, fill: "var(--viz-axis-text)" } as const;

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
} as const;

export function CollectionCharts({
  daily,
  byFeeType,
}: {
  daily: DailyRow[];
  byFeeType: { name: string; total: number }[];
}) {
  const dailyTotals = Object.entries(
    daily.reduce<Record<string, number>>((acc, r) => {
      acc[r.collection_date] = (acc[r.collection_date] ?? 0) + Number(r.total);
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, total]) => ({ date, total }));

  const monthly = Object.entries(
    daily.reduce<Record<string, number>>((acc, r) => {
      const m = r.collection_date.slice(0, 7);
      acc[m] = (acc[m] ?? 0) + Number(r.total);
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

  const byMethod = Object.entries(
    daily.reduce<Record<string, number>>((acc, r) => {
      acc[r.payment_method] = (acc[r.payment_method] ?? 0) + Number(r.total);
      return acc;
    }, {}),
  )
    .map(([method, total]) => ({
      name: METHOD_LABELS[method] ?? method,
      total,
    }))
    .sort((a, b) => b.total - a.total);

  if (daily.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No collections recorded for this school year yet. Charts appear once
          the first payment is posted.
        </CardContent>
      </Card>
    );
  }

  const maxDaily = Math.max(...dailyTotals.map((d) => d.total), 0);
  const maxMonthly = Math.max(...monthly.map((d) => d.total), 0);
  const maxFee = Math.max(...byFeeType.map((d) => d.total), 0);
  const maxMethod = Math.max(...byMethod.map((d) => d.total), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Daily collections">
        <LineChart data={dailyTotals} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => moneyAxisTick(v, maxDaily)}
          />
          <Tooltip
            formatter={(v) => [formatMoney(Number(v)), "Collected"]}
            labelFormatter={(d) => formatDate(String(d))}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: GRID }}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="total"
            stroke={SERIES}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartCard>

      <ChartCard title="Monthly collections">
        <BarChart data={monthly} margin={{ left: 4, right: 12, top: 16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(m: string) => formatMonth(m).slice(0, 3)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => moneyAxisTick(v, maxMonthly)}
          />
          <Tooltip
            formatter={(v) => [formatMoney(Number(v)), "Collected"]}
            labelFormatter={(m) => formatMonth(String(m))}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: GRID, fillOpacity: 0.4 }}
          />
          <Bar isAnimationActive={false} dataKey="total" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList
              dataKey="total"
              position="top"
              formatter={(v) => moneyBarLabel(Number(v))}
              className="fill-muted-foreground"
              fontSize={10}
            />
          </Bar>
        </BarChart>
      </ChartCard>

      <ChartCard title="Collections by fee type">
        <BarChart
          data={byFeeType}
          layout="vertical"
          margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => moneyAxisTick(v, maxFee)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            formatter={(v) => [formatMoney(Number(v)), "Collected"]}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: GRID, fillOpacity: 0.4 }}
          />
          <Bar isAnimationActive={false} dataKey="total" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={28}>
            <LabelList
              dataKey="total"
              position="right"
              formatter={(v) => moneyBarLabel(Number(v))}
              className="fill-muted-foreground"
              fontSize={10}
            />
          </Bar>
        </BarChart>
      </ChartCard>

      {/*
        A bar, not a donut. Payment method is one measure across four
        categories, so a single series reads better than four hues — and a
        donut is an all-pairs form where only three categorical slots clear
        the colour-vision-deficiency floors.
      */}
      <ChartCard title="By payment method">
        <BarChart
          data={byMethod}
          layout="vertical"
          margin={{ left: 8, right: 56, top: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => moneyAxisTick(v, maxMethod)}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={140}
          />
          <Tooltip
            formatter={(v) => [formatMoney(Number(v)), "Collected"]}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: GRID, fillOpacity: 0.4 }}
          />
          <Bar isAnimationActive={false} dataKey="total" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={28}>
            <LabelList
              dataKey="total"
              position="right"
              formatter={(v) => moneyBarLabel(Number(v))}
              className="fill-muted-foreground"
              fontSize={10}
            />
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
