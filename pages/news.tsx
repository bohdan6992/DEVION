import NewsBoard from "@/components/NewsBoard";
import SocialFeedWidget from "@/components/SocialFeedWidget";

export default function StatsPage() {
  return (
    <div className="min-h-screen bg-[#030303] text-zinc-200 selection:bg-emerald-500/30 selection:text-white">
      {/* 
         max-w-[1600px] - обмежує ширину контенту по центру
         flex-col gap-8 - створює однакові вертикальні проміжки між секціями
      */}
      <main className="max-w-[1600px] mx-auto px-4 py-8 flex flex-col gap-8">
        
        <section className="w-full">
          <SocialFeedWidget
            initialSource="twitter"
            initialQuery="AAPL NVDA SPY"
            limit={24}
            refreshMs={120000} // автооновлення кожні 2 хв
          />
        </section>

        <section className="w-full">
          <NewsBoard />
        </section>

      </main>
    </div>
  );
}