import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export type Activity = {
  day: string;
  new_users: number;
  trips: number;
  sos: number;
  posts: number;
};

const tooltipStyle = {
  background: "rgba(17,17,17,0.95)",
  border: "1px solid rgba(212,175,55,0.25)",
  borderRadius: 12,
  fontSize: 11,
  color: "#F5F5F5",
} as const;

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
        {title}
      </p>
      {children}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

const axisTick = { fill: "#8C8C8C", fontSize: 10 } as const;

export default function AdminCharts({ activity }: { activity: Activity[] }) {
  return (
    <>
      <ChartCard title="Novos cadastros — últimos 30 dias">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#F3D675" }} />
            <Area
              type="monotone"
              dataKey="new_users"
              stroke="#D4AF37"
              strokeWidth={2}
              fill="url(#gGold)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Atividade — viagens, SOS e posts">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "#F3D675" }}
              cursor={{ fill: "rgba(212,175,55,0.06)" }}
            />
            <Bar dataKey="trips" name="Viagens" stackId="a" fill="#D4AF37" />
            <Bar dataKey="posts" name="Posts" stackId="a" fill="#F3D675" />
            <Bar dataKey="sos" name="SOS" stackId="a" fill="#D92323" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <LegendDot color="#D4AF37" label="Viagens" />
          <LegendDot color="#F3D675" label="Posts" />
          <LegendDot color="#D92323" label="SOS" />
        </div>
      </ChartCard>
    </>
  );
}
