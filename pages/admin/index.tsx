import { useEffect, useState } from "react";
import UploadImage from "@/components/UploadImage";
import Link from "next/link";

type Strategy = { id: number; name: string; description: string | null; icon: string | null };

export default function Admin() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [form, setForm] = useState<Partial<Strategy>>({});
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const r = await fetch("/api/strategies");
    setStrategies(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        await fetch(`/api/strategies/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await fetch(`/api/strategies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setForm({});
      setEditing(null);
      await load();
    } finally {
      setLoading(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Видалити стратегію? Це також видалить пов’язані трейди.")) return;
    await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100">
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">← На головну</Link>
        <h1 className="text-2xl font-bold">Адмін — Стратегії</h1>
        <div />
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Форма */}
        <div className="rounded-2xl p-6 bg-neutral-800/60 shadow-xl ring-1 ring-white/5">
          <h2 className="text-xl font-semibold mb-4">{editing ? "Редагувати стратегію" : "Нова стратегія"}</h2>
          <form onSubmit={save} className="grid md:grid-cols-2 gap-3">
            <input className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                   placeholder="Назва" required value={form.name || ""}
                   onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                   placeholder="Icon URL" value={form.icon || ""}
                   onChange={e => setForm({ ...form, icon: e.target.value })} />
            <textarea className="md:col-span-2 px-3 py-2 rounded bg-neutral-900 border border-neutral-700"
                      placeholder="Опис (опційно)" rows={3}
                      value={form.description || ""}
                      onChange={e => setForm({ ...form, description: e.target.value })} />
            <div className="flex items-center gap-3">
              <UploadImage onUploaded={(url) => setForm({ ...form, icon: url })} />
              {form.icon ? <a className="underline" href={form.icon} target="_blank">переглянути іконку</a> : null}
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button className="btn" disabled={loading}>{editing ? "Зберегти" : "Додати"}</button>
              {editing && (
                <button type="button" className="btn" onClick={() => { setEditing(null); setForm({}); }}>
                  Скасувати
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Список */}
        <div className="rounded-2xl p-6 bg-neutral-800/60 shadow-xl ring-1 ring-white/5">
          <h2 className="text-xl font-semibold mb-4">Список стратегій</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-neutral-400 border-b border-neutral-700">
                <tr><th className="py-2">ID</th><th>Назва</th><th>Іконка</th><th>Дії</th></tr>
              </thead>
              <tbody>
              {strategies.map(s => (
                <tr key={s.id} className="border-b border-neutral-800 hover:bg-neutral-800/40">
                  <td className="py-2">{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.icon ? <a className="underline" href={s.icon} target="_blank">іконка</a> : "—"}</td>
                  <td className="flex gap-2 py-2">
                    <Link className="btn" href={`/strategy/${s.id}`}>Відкрити</Link>
                    <button className="btn" onClick={() => { setEditing(s); setForm(s); }}>Редагувати</button>
                    <button className="btn" onClick={() => del(s.id)}>Видалити</button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .btn { @apply px-3 py-2 rounded bg-neutral-700 hover:bg-neutral-600 transition; }
      `}</style>
    </div>
  );
}
