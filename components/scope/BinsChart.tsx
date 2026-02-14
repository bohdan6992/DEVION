import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function BinsChart({
  data,
}: {
  data: any;
}) {
  const bins = data?.bins ?? [];

  const chartData = bins.map((b: any) => ({
    label: b.label,
    avg: b.avg,
    n: b.n,
  }));

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <h2 className="text-white text-lg font-semibold mb-4">
        Bins (Trade vs move_1000)
      </h2>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="label" stroke="#888" />
            <YAxis stroke="#888" />
            <Tooltip />
            <Bar dataKey="avg" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
