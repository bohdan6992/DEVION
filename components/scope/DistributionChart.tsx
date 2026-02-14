import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function DistributionChart({
  data,
}: {
  data: any;
}) {
  const binStart = data?.binStart ?? 0;
  const binSize = data?.binSize ?? 0.05;
  const posCounts: number[] = data?.posCounts ?? [];
  const negCounts: number[] = data?.negCounts ?? [];

  const chartData = posCounts.map((pos, i) => ({
    bin: (binStart + i * binSize).toFixed(2),
    win: pos,
    loss: negCounts[i] ?? 0,
  }));

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <h2 className="text-white text-lg font-semibold mb-4">
        Distribution
      </h2>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="bin" stroke="#888" />
            <YAxis stroke="#888" />
            <Tooltip />
            <Bar dataKey="win" fill="#10b981" />
            <Bar dataKey="loss" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
