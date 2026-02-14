import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function CumsumChart({
  data,
}: {
  data: any;
}) {
  const dates: number[] = data?.datesNy ?? [];
  const cumsum: number[] = data?.cumsum ?? [];

  const chartData = dates.map((d, i) => ({
    date: d.toString(),
    value: cumsum[i],
  }));

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <h2 className="text-white text-lg font-semibold mb-4">
        Cumsum (Equity Curve)
      </h2>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="date" stroke="#888" />
            <YAxis stroke="#888" />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
