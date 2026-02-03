// pages/index.tsx
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// --- КОМПОНЕНТИ ---
import NYTopInfo from "@/components/mainPage/NYTopInfo";
import BenchmarksStrip from "@/components/mainPage/BenchmarksStrip";
import SectorHeatmap from "@/components/mainPage/SectorHeatmap";
import EarningsTwoDays from "@/components/mainPage/EarningsTwoDays";
import TopMoversWidget from "@/components/mainPage/TopMoversWidget";
import NewsSentimentBadge from "@/components/mainPage/NewsSentimentBadge";
import BenchmarksTable from "@/components/mainPage/BenchmarksTable";
import EconomicCalendarUS from "@/components/mainPage/EconomicCalendar";
import QuarterCalendar from "@/components/mainPage/QuarterCalendar";
import NewsTicker from "@/components/mainPage/NewsTicker"; 

// Динамічний імпорт
const MarketMood = dynamic(() => import("@/components/mainPage/MarketMood"), { ssr: false });

// --- ТИПИ ---
type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  categories?: string[];
};

type EventItem = {
  id: string;
  title: string;
  date: string;
  time?: string;
  ticker?: string;
  tags?: string[];
  rank?: "S" | "A" | "B" | "F" | "N";
  note?: string;
  link?: string;
};

export default function Home() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // 1. Завантаження новин
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/news/investing?limit=40");
        const data = await r.json();
        if (mounted) setNews(data.items || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoadingNews(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  // 2. Завантаження подій
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/events");
        const data = await r.json();
        if (mounted) setEvents(data.items || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoadingEvents(false);
      }
    })();
    return () => { mounted = false };
  }, []);

  return (
    // ТУТ ЗМІНЕНО: bg-[#030303] -> bg-transparent
    <div className="min-h-screen bg-transparent text-zinc-200 selection:bg-emerald-500/30 selection:text-white overflow-x-hidden">
      
      {/* GLOBAL CONTAINER */}
      <main className="max-w-[1800px] mx-auto px-6 py-8 flex flex-col gap-8 pb-32">
        
        {/* 1. HEADER */}
        <section className="w-full">
          <NYTopInfo />
        </section>

        {/* 2. TICKER TAPE */}
        <section className="w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0a]/40 shadow-lg">
          <BenchmarksStrip />
        </section>

        {/* 3. HEATMAP */}
        <section className="w-full rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 backdrop-blur-md overflow-hidden shadow-xl">
          <div className="h-[600px] w-full">
            <SectorHeatmap
              height={600}
              locale="uk"
              defaultDataSource="SPX500"
              defaultGrouping="sector"
              defaultSizeBy="market_cap_basic"
              defaultColorBy="change"
              tooltip
            />
          </div>
        </section>

        {/* 4. DASHBOARD GRID (Analysis & Sentiment) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex flex-col h-full min-h-[380px] rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0a0a0a]/40 shadow-lg">
             <EarningsTwoDays />
          </div>
          <div className="flex flex-col h-full min-h-[380px] rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0a0a0a]/40 shadow-lg">
            <MarketMood fetchUrl="/api/mood" refreshMs={60_000} />
          </div>
          <div className="flex flex-col h-full min-h-[380px] rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0a0a0a]/40 shadow-lg">
             <TopMoversWidget
              universe="AAPL,MSFT,TSLA,NVDA,QQQ,SPY,AMD,META,NFLX,GOOGL"
              limit={5}
              refreshMs={60000}
            />
          </div>
          <div className="flex flex-col h-full min-h-[380px] rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0a0a0a]/40 shadow-lg">
            <NewsSentimentBadge
              fetchUrl="/api/news/investing?limit=60"
              refreshMs={120000}
            />
          </div>
        </div>

        {/* 5. DATA TABLES GRID */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div className="min-h-[550px] w-full rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden relative shadow-lg">
            <div className="absolute inset-0 overflow-auto scrollbar-thin scrollbar-thumb-white/10"> 
              <BenchmarksTable height={550} />
            </div>
          </div>
          <div className="min-h-[550px] w-full rounded-2xl border border-white/[0.06] bg-[#0a0a0a]/60 overflow-hidden relative shadow-lg">
            <div className="absolute inset-0 overflow-auto scrollbar-thin scrollbar-thumb-white/10">
              <EconomicCalendarUS height={550} />
            </div>
          </div>
        </div>

        {/* 6. NEWS LIST (Переміщено сюди) */}
        <section className="w-full">
           <NewsTicker items={news.slice(0, 30)} loading={loadingNews} />
        </section>
        
        {/* 7. QUARTER CALENDAR (Переміщено в кінець) */}
        <section className="w-full">
          {loadingEvents ? (
            <div className="h-72 flex items-center justify-center border border-white/10 rounded-2xl bg-[#0a0a0a]/40 text-zinc-500 font-mono uppercase tracking-widest text-xs animate-pulse">
              Initializing Calendar Data...
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0a0a0a]/40 p-1 shadow-lg">
              <QuarterCalendar events={events} />
            </div>
          )}
        </section>

      </main>
    </div>
  );
}