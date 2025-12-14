import TrapFullExplorer from "@/components/signals/TrapFullExplorer";
import TickerResearchPanel from "@/components/TickerResearchPanel";
import NotesBoard from "@/components/NotesBoard";

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-[#030303] text-zinc-200 selection:bg-emerald-500/30 selection:text-white">
      {/* 
         max-w-[1600px] - центрує контент
         flex-col gap-8 - гарантує однакові відступи між компонентами
      */}
      <main className="max-w-[1600px] mx-auto px-4 py-8 flex flex-col gap-8">
        
        <section className="w-full">
          <TickerResearchPanel />
        </section>

        <section className="w-full">
          <TrapFullExplorer />
        </section>

        <section className="w-full">
          <NotesBoard />
        </section>

      </main>
    </div>
  );
}