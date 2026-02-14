import { fmt, labelize } from "./format";

export default function PerformanceStats({ data }: { data: any }) {
  const s = data?.stats;
  if (!s) return null;

  const entries = Object.entries(s);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <h2 className="text-white text-lg font-semibold mb-4">Performance</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white/[0.03] px-3 py-2">
            <div className="text-zinc-500 text-[10px] uppercase tracking-widest">{labelize(k)}</div>
            <div className="text-zinc-200 font-mono mt-1">{fmt(v)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
