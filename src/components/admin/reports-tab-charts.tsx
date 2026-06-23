import type { ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-ui";

type MonthlyPoint = {
  month: string;
  certificates: number;
  enrolments: number;
};

type CoursePoint = {
  name: string;
  enrolments: number;
  certificates: number;
};

const CHART_GRID = "color-mix(in oklab, var(--border) 68%, transparent)";
const CHART_PRIMARY = "var(--primary)";
const CHART_ACCENT = "var(--gold)";

export function ReportsCharts({
  monthly,
  byCourse,
}: {
  monthly: MonthlyPoint[];
  byCourse: CoursePoint[];
}) {
  return (
    <>
      <ChartPanel
        title="Activity by month"
        description="A quick read on how enrolment intake and certificate issuance are moving over time."
      >
        {monthly.length === 0 ? (
          <AdminEmptyState
            icon={TrendingUp}
            title="No activity yet"
            description="Monthly charts will appear once enrolments and certificates start accumulating."
            className="min-h-[320px]"
          />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={monthly} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "1rem",
                  border: "1px solid color-mix(in oklab, var(--border) 78%, white 22%)",
                  boxShadow: "var(--shadow-soft)",
                  background: "rgb(255 255 255 / 0.94)",
                }}
              />
              <Line
                type="monotone"
                dataKey="enrolments"
                stroke={CHART_PRIMARY}
                strokeWidth={3}
                dot={{ fill: CHART_PRIMARY, strokeWidth: 0, r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="certificates"
                stroke={CHART_ACCENT}
                strokeWidth={3}
                dot={{ fill: CHART_ACCENT, strokeWidth: 0, r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartPanel>

      <ChartPanel
        title="Enrolments and certificates by course"
        description="Use this view to spot courses with strong intake, low completion flow, or high certificate output."
      >
        {byCourse.length === 0 ? (
          <AdminEmptyState
            title="No course activity yet"
            description="Course-level reporting will appear after enrolments or certificates are recorded."
            className="min-h-[320px]"
          />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byCourse} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "1rem",
                  border: "1px solid color-mix(in oklab, var(--border) 78%, white 22%)",
                  boxShadow: "var(--shadow-soft)",
                  background: "rgb(255 255 255 / 0.94)",
                }}
              />
              <Bar dataKey="enrolments" fill={CHART_PRIMARY} radius={[8, 8, 0, 0]} />
              <Bar dataKey="certificates" fill={CHART_ACCENT} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartPanel>
    </>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <AdminPanel className="p-6 sm:p-7">
      <div className="max-w-2xl">
        <p className="kicker">Report View</p>
        <h3 className="mt-2 text-2xl text-foreground">{title}</h3>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-6">{children}</div>
    </AdminPanel>
  );
}
