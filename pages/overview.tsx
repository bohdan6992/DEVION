import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import NYTopInfo from "@/components/mainPage/NYTopInfo";
import BenchmarksStrip from "@/components/mainPage/BenchmarksStrip";
import SectorHeatmap from "@/components/mainPage/SectorHeatmap";
import NewsSentimentBadge from "@/components/mainPage/NewsSentimentBadge";
import BenchmarksTable from "@/components/mainPage/BenchmarksTable";
import EconomicCalendarUS from "@/components/mainPage/EconomicCalendar";
import QuarterCalendar from "@/components/mainPage/QuarterCalendar";
import NewsTicker from "@/components/mainPage/NewsTicker";
import ThemeDollarSpinner from "@/components/mainPage/ThemeDollarSpinner";

const MarketMood = dynamic(() => import("@/components/mainPage/MarketMood"), { ssr: false });

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
    return () => {
      mounted = false;
    };
  }, []);

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
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="dashboard-page min-h-screen overflow-x-hidden selection:text-white">
      <main className="dashboard-scope relative max-w-[1850px] mx-auto px-4 sm:px-6 lg:px-10 py-8 pb-32 flex flex-col gap-6">
        <section className="w-full">
          <NYTopInfo />
        </section>

        <section>
          <BenchmarksStrip />
        </section>

        <section>
          <SectorHeatmap
            height={620}
            locale="uk"
            defaultDataSource="SPX500"
            defaultGrouping="sector"
            defaultSizeBy="market_cap_basic"
            defaultColorBy="change"
            tooltip
          />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="min-h-[260px] lg:min-h-[500px] lg:row-span-2">
            <div className="h-full w-full flex items-center justify-center">
              <ThemeDollarSpinner />
            </div>
          </div>
          <div className="min-h-[300px] lg:min-h-[600px] lg:row-span-2">
            <div className="h-full min-h-[300px] lg:min-h-[585px] flex flex-col gap-4">
              <div className="h-[50%] min-h-[285px]">
                <MarketMood fetchUrl="/api/mood" refreshMs={60_000} />
              </div>
              <div className="h-[50%] min-h-[285px]">
                <NewsSentimentBadge fetchUrl="/api/news/investing?limit=60" refreshMs={120000} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <BenchmarksTable height={560} />
          <EconomicCalendarUS height={560} />
        </div>

        <section>
          <NewsTicker items={news.slice(0, 30)} loading={loadingNews} />
        </section>

        <section>
          {loadingEvents ? (
            <div className="h-72 flex items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/5 text-emerald-200/70 font-mono uppercase tracking-[0.2em] text-xs animate-pulse">
              Initializing Calendar Data
            </div>
          ) : (
            <QuarterCalendar events={events} />
          )}
        </section>
      </main>

    </div>
  );
}
