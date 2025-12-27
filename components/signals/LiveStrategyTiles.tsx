// components/signals/LiveStrategyTiles.tsx
"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Activity, BarChart2, Zap } from "lucide-react";
import { 
  DndContext, closestCenter, KeyboardSensor, PointerSensor, 
  useSensor, useSensors, DragEndEvent, DragOverEvent,
} from "@dnd-kit/core";
import { 
  arrayMove, SortableContext, sortableKeyboardCoordinates, 
  rectSortingStrategy, useSortable 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { STRATEGY_CATALOG } from "@/lib/strategyCatalog";

/* ============================= TYPES ============================= */

type Tile = {
  key: string;
  title: string;
  icon: string;
  score: number;
  maxScore: number;
  tickers: { t: string; s: number }[];
  spark: number[];
  hot: boolean;
};

type ContainerState = {
  priority: Tile[];
  catalog: Tile[];
};

const STORAGE_KEY = "devion_deep_space_terminal_TITAN_v7";

/* ============================= COLORS ============================= */

const getColorTheme = (key: string) => {
  const themes: Record<string, { hex: string; text: string; bg: string; badge: string }> = {
    breakout: { hex: "#10b881", text: "text-emerald-400", bg: "bg-emerald-500/10", badge: "bg-emerald-950/30 border-emerald-500/20" },
    pumpAndDump: { hex: "#fb7185", text: "text-rose-400", bg: "bg-rose-500/10", badge: "bg-rose-950/30 border-rose-500/20" },
    reversal: { hex: "#60a5fa", text: "text-blue-400", bg: "bg-blue-500/10", badge: "bg-blue-950/30 border-blue-500/20" },
    earnings: { hex: "#fbbf24", text: "text-amber-400", bg: "bg-amber-500/10", badge: "bg-amber-950/30 border-amber-500/20" },
    gap: { hex: "#a78bfa", text: "text-violet-400", bg: "bg-violet-500/10", badge: "bg-violet-950/30 border-violet-500/20" },
    chrono: { hex: "#22d3ee", text: "text-cyan-400", bg: "bg-cyan-500/10", badge: "bg-cyan-950/30 border-cyan-500/20" },
    powerHour: { hex: "#f97316", text: "text-orange-400", bg: "bg-orange-500/10", badge: "bg-orange-950/30 border-orange-500/20" },
    default: { hex: "#71717a", text: "text-zinc-400", bg: "bg-zinc-500/10", badge: "bg-zinc-900/30 border-zinc-500/20" },
  };
  return themes[key] || themes.default;
};

/* ============================= UI: Tooltip ============================= */

const GlassTooltip = ({ title, value, x, y, visible, color }: any) => (
  <div 
    className={`fixed z-[100] pointer-events-none transition-all duration-300 ease-out py-2.5 px-4 rounded-xl border border-white/10 bg-[#050505]/95 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,0,0,1)] ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}
    style={{ left: x, top: y - 70, transform: 'translateX(-50%)' }}
  >
    <div className="flex items-center gap-3">
      <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 15px ${color}` }} />
      <div className="flex flex-col">
        <span className="font-mono text-[10px] font-black text-white uppercase tracking-[0.2em] leading-none mb-1">{title}</span>
        <span className="font-mono text-[11px] text-zinc-100 tabular-nums font-bold tracking-tight uppercase italic">{value}</span>
      </div>
    </div>
  </div>
);

/* ============================= Header Components ============================= */

function RadarLayer({ list, color, gradId, maxR, centerX, centerY, onHover }: any) {
  if (list.length < 3) return null;
  const points = list.map((item: Tile, i: number) => {
    const angle = (Math.PI * 2 * i) / list.length - Math.PI / 2;
    const r = (Math.min(item.score, 20) / 20) * maxR;
    return { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle), item };
  });
  const polygonPath = points.map((p: any) => `${p.x},${p.y}`).join(" ");
  return (
    <g className="transition-all duration-1000">
      <polygon points={polygonPath} fill={`url(#${gradId})`} stroke={color} strokeWidth="1.5" className="opacity-50 group-hover/radar:opacity-80 transition-all duration-1000" />
      {points.map((p: any, idx: number) => (
        <circle 
          key={idx} cx={p.x} cy={p.y} r="4" fill={color} 
          className="cursor-crosshair hover:r-6 transition-all pointer-events-auto"
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
          onMouseEnter={() => onHover({ title: p.item.title, value: `${p.item.score} SIGNALS`, color })}
          onMouseLeave={() => onHover(null)}
        />
      ))}
    </g>
  );
}

function TrendGraph({ data, color, title, onHover, yOffset = 0, gradId }: any) {
  if (data.length < 2) return null;
  const width = 1000;
  const height = 80;
  const points = data.map((item: Tile, i: number) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (item.score / 20) * height;
    return { x, y, item };
  });
  const linePath = points.map((p: any) => `${p.x},${p.y}`).join(" ");
  const areaPath = `${points.map((p: any) => `${p.x},${p.y}`).join(" ")} ${width},${height} 0,${height}`;

  return (
    <g transform={`translate(0, ${yOffset})`}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPath} fill={`url(#${gradId})`} className="pointer-events-none" />
      <polyline points={linePath} fill="none" stroke={color} strokeWidth="2.5" className="opacity-60" strokeDasharray="12 6" />
      {points.map((p: any, i: number) => (
        <circle 
          key={i} cx={p.x} cy={p.y} r="4" fill={color} className="cursor-crosshair hover:r-6 transition-all"
          style={{ filter: `drop-shadow(0 0 10px ${color})` }}
          onMouseEnter={() => onHover({ title: `${title}: ${p.item.title}`, value: `${p.item.score} SCORE`, color })}
          onMouseLeave={() => onHover(null)}
        />
      ))}
    </g>
  );
}

function GlobalDashboard({ items }: { items: ContainerState }) {
  const [hoveredData, setHoveredData] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const safePriority = useMemo(() => items?.priority?.filter(Boolean) || [], [items.priority]);
  const safeCatalog = useMemo(() => items?.catalog?.filter(Boolean) || [], [items.catalog]);
  const all = useMemo(() => [...safePriority, ...safeCatalog], [safePriority, safeCatalog]);
  
  const totalScore = all.reduce((acc, i) => acc + (i?.score || 0), 0);
  const maxScore = Math.max(...all.map(i => i?.score || 0), 1);
  const centerX = 150, centerY = 150, maxR = 130;

  return (
    <div className="flex flex-col lg:flex-row gap-0 mb-24 h-auto lg:h-[400px] relative select-none border border-white/[0.05] rounded-[3rem] overflow-hidden bg-[#050505]" onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}>
      <GlassTooltip visible={!!hoveredData} x={mousePos.x} y={mousePos.y} {...hoveredData} />

      {/* LASER SCANNER */}
      <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
        <div className="h-full w-[300px] absolute top-0 animate-[scannerWide_5s_linear_infinite] -translate-x-1/2">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" style={{ mixBlendMode: 'plus-lighter', filter: 'blur(45px)' }} />
            <div className="h-full w-[2px] bg-gradient-to-b from-transparent via-emerald-400 to-transparent absolute top-0 left-1/2 -translate-x-1/2" style={{ boxShadow: '0 0 20px rgba(16, 185, 129, 0.9)', mixBlendMode: 'screen' }} />
        </div>
      </div>

      {/* RADAR */}
      <div className="lg:w-[400px] flex flex-col items-center justify-center relative shrink-0 border-r border-white/[0.05] bg-black/20 z-10">
        <span className="absolute top-8 font-mono text-[8px] text-zinc-600 uppercase tracking-[0.6em]">Spatial Load Radar</span>
        <div className="relative w-[300px] h-[300px] flex items-center justify-center pointer-events-none group/radar">
          <svg viewBox="0 0 300 300" className="w-full h-full overflow-visible">
            <defs>
              <radialGradient id="gradP_deep" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#10b881" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b881" stopOpacity="0.05" />
              </radialGradient>
              <radialGradient id="gradC_deep" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.05" />
              </radialGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((lvl) => (
              <circle key={lvl} cx={centerX} cy={centerY} r={maxR * lvl} fill="none" stroke="white" strokeWidth="1" className="opacity-[0.05]" />
            ))}
            <RadarLayer list={safeCatalog} color="#a78bfa" gradId="gradC_deep" maxR={maxR} centerX={centerX} centerY={centerY} onHover={setHoveredData} />
            <RadarLayer list={safePriority} color="#10b881" gradId="gradP_deep" maxR={maxR} centerX={centerX} centerY={centerY} onHover={setHoveredData} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
              <span className="text-6xl font-bold font-mono text-white tracking-tighter tabular-nums leading-none drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]">{totalScore}</span>
              <span className="font-mono text-[8px] text-zinc-600 uppercase tracking-[0.4em] mt-3">Total Pulse</span>
          </div>
        </div>
      </div>

      {/* ANALYZER */}
      <div className="flex-1 flex flex-col relative overflow-hidden z-10">
        <div className="flex items-center gap-6 p-8 pb-0 relative z-10">
             <span className="font-mono text-[8px] text-zinc-500 uppercase tracking-[0.6em] whitespace-nowrap italic">Engine Spectrum Analyzer</span>
             <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent" />
        </div>

        <div className="flex-1 flex flex-col relative px-4">
            <div className="h-[140px] w-full mt-4 relative z-20">
                <svg viewBox="0 0 1000 200" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    <TrendGraph data={safePriority} color="#10b881" title="Priority Trend" gradId="areaP" onHover={setHoveredData} yOffset={20} />
                    <TrendGraph data={safeCatalog} color="#a78bfa" title="Catalog Trend" gradId="areaC" onHover={setHoveredData} yOffset={100} />
                </svg>
            </div>

            <div className="mt-auto flex items-end w-full h-[150px] relative z-10 gap-2 mb-2">
                {all.map((item, idx) => {
                    const theme = getColorTheme(item.key);
                    const isPriority = idx < safePriority.length;
                    return (
                        <div 
                            key={item.key + idx} 
                            className="flex-1 relative h-full flex flex-col justify-end cursor-crosshair group/bar" 
                            onMouseEnter={() => setHoveredData({ title: item.title, value: `${item.score} UNIT LOAD`, color: theme.hex })} 
                            onMouseLeave={() => setHoveredData(null)}
                        >
                            <div 
                                className="w-full transition-all duration-700 relative rounded-t-[1px]"
                                style={{ 
                                    height: `${(item.score/maxScore)*100}%`, 
                                    border: `2px solid ${theme.hex}50`,
                                    borderBottom: 'none',
                                    background: 'transparent'
                                }}
                            >
                                <div className="absolute top-0 left-0 right-0 h-[2px] z-20 group-hover/bar:brightness-150 transition-all" style={{ backgroundColor: theme.hex, boxShadow: `0 0 12px ${theme.hex}` }} />
                                {isPriority && <div className="absolute inset-0 bg-white/[0.01] animate-pulse" />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes scannerWide {
          0% { left: 0%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
}

/* ============================= Strategy Card ============================= */

function StrategyCard({ id, data, isFeatured }: { id: string, data: Tile, isFeatured: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  if (!data) return null;
  const theme = getColorTheme(data.key);
  const percent = Math.min(100, Math.round((data.score / data.maxScore) * 100));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    // ЗБІЛЬШЕНО ВИСОТУ КАРТОК: 280px для великих, 240px для малих
    <div ref={setNodeRef} style={style} className={`group relative isolate flex flex-row rounded-[2.5rem] border border-white/[0.08] bg-[#0a0a0a]/60 backdrop-blur-xl overflow-hidden transition-all duration-500 hover:border-white/20 shadow-2xl ${isFeatured ? 'h-[280px]' : 'h-[240px]'}`}>
      <div className="flex-1 flex flex-col relative min-w-0">
        <Link href={`/signals/${data.key}`} className="absolute inset-0 z-0" />
        <div className="p-8 flex flex-col h-full relative z-10 text-zinc-100">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-5">
              <div {...attributes} {...listeners} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-2xl border border-white/5 cursor-grab active:cursor-grabbing pointer-events-auto transition-transform active:scale-95 z-20 ${theme.bg} backdrop-blur-xl`}>
                {data.icon}
              </div>
              <div className="min-w-0 pointer-events-none">
                <h3 className="font-bold font-sans truncate tracking-tight leading-tight text-[21px]">{data.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                   <div className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase border ${theme.badge}`}>Live v4</div>
                </div>
              </div>
            </div>
            <div className="font-mono text-[10px] text-zinc-500 tabular-nums bg-white/[0.03] px-2.5 py-1 rounded-full border border-white/5">{percent}%</div>
          </div>

          <div className="mt-6 flex flex-wrap flex-row gap-2 pointer-events-none relative z-10">
            {data.tickers.slice(0, isFeatured ? 5 : 3).map((t, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/[0.05] bg-[#0a0a0a]/60 backdrop-blur-md">
                <span className="font-mono text-[10px] font-bold text-zinc-200 uppercase tracking-tighter">{t.t}</span>
                <span className="font-mono text-[10px] text-zinc-500 tabular-nums font-bold">{t.s}</span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-end justify-between pointer-events-none relative mb-4">
            <div className="space-y-1">
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-[0.3em] opacity-60 italic leading-none">Signal Density</p>
              <div className="flex items-baseline gap-2 leading-none">
                <span className={`font-mono font-bold text-zinc-100 tracking-tighter tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] ${isFeatured ? 'text-[48px]' : 'text-[32px]'}`}>
                  {data.score}
                </span>
                <span className="font-mono text-[14px] text-zinc-700 tabular-nums font-bold opacity-50">/ {data.maxScore}</span>
              </div>
            </div>
            <div className="absolute right-0 bottom-0 w-[140px] h-[50px] opacity-10 group-hover:opacity-40 transition-all duration-1000 text-zinc-500">
              <svg viewBox="0 0 140 50" className="w-full h-full overflow-visible">
                <polyline points={data.spark?.map((v, i) => `${(i/9)*140},${50 - (v/100)*40 - 5}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* PROGRESS BAR - FLOATING CAPSULE DESIGN */}
        <div className="absolute bottom-8 left-10 right-10 h-[3px] bg-white/[0.03] z-10 rounded-full overflow-hidden">
          <div 
            className="h-full relative transition-all duration-[1200ms] cubic-bezier(0.4, 0, 0.2, 1) rounded-full" 
            style={{ width: `${percent}%`, backgroundColor: theme.hex, boxShadow: `0 0 15px ${theme.hex}60` }}
          >
             <div 
               className="absolute top-[-4px] right-0 h-4 w-4 rounded-full blur-[1px] shadow-[0_0_12px_currentColor]" 
               style={{ color: theme.hex, backgroundColor: theme.hex }} 
             />
          </div>
        </div>
      </div>

      {/* Sidebar Buttons */}
      <div className="w-[65px] shrink-0 flex flex-col border-l border-white/5 bg-[#0d0d0f]/95 backdrop-blur-xl relative z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] rounded-r-[2.5rem]">
        <Link href={`/signals/${data.key}`} className="flex-1 flex flex-col items-center justify-center border-b border-white/5 hover:bg-white/[0.08] transition-all group/btn rounded-tr-[2.5rem]">
          <Zap size={20} className="text-zinc-500 group-hover/btn:text-orange-400 transition-colors" />
          <span className="font-mono text-[8px] font-black text-zinc-700 group-hover/btn:text-white tracking-widest mt-1 uppercase">SGN</span>
        </Link>
        <Link href={`/stats/${data.key}`} className="flex-1 flex flex-col items-center justify-center border-b border-white/5 hover:bg-white/[0.08] transition-all group/btn">
          <BarChart2 size={20} className="text-zinc-500 group-hover/btn:text-violet-400 transition-colors" />
          <span className="font-mono text-[8px] font-black text-zinc-700 group-hover/btn:text-white tracking-widest mt-1 uppercase">STS</span>
        </Link>
        <Link href={`/perform/${data.key}`} className="flex-1 flex flex-col items-center justify-center hover:bg-white/[0.08] transition-all group/btn rounded-br-[2.5rem]">
          <Activity size={20} className="text-zinc-500 group-hover/btn:text-emerald-400 transition-colors" />
          <span className="font-mono text-[8px] font-black text-zinc-700 group-hover/btn:text-white tracking-widest mt-1 uppercase">PRF</span>
        </Link>
      </div>
    </div>
  );
}

/* ============================= Main Component ============================= */

export default function LiveStrategyTiles() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<ContainerState>({ priority: [], catalog: [] });

  useEffect(() => {
    const buildStrategyObj = (key: string): Tile | null => {
      const meta = STRATEGY_CATALOG.find(s => s.key === key);
      if (!meta) return null;
      return {
        key: meta.key, title: meta.name, icon: meta.icon || "✨",
        score: Math.floor(Math.random() * 15) + 5, maxScore: 20,
        tickers: [{ t: "NVDA", s: 92 }, { t: "ETH", s: 88 }, { t: "BTC", s: 76 }],
        spark: Array.from({ length: 10 }, () => Math.floor(Math.random() * 100)),
        hot: Math.random() > 0.8
      };
    };

    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      try {
        const { priority: pKeys, catalog: cKeys } = JSON.parse(savedLayout);
        setItems({
          priority: pKeys.map(buildStrategyObj).filter(Boolean) as Tile[],
          catalog: cKeys.map(buildStrategyObj).filter(Boolean) as Tile[]
        });
      } catch (e) { console.error(e); }
    } else {
      const all = STRATEGY_CATALOG.map(m => buildStrategyObj(m.key)).filter(Boolean) as Tile[];
      setItems({ priority: all.slice(0, 4), catalog: all.slice(4) });
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      priority: items.priority.filter(Boolean).map(i => i.key),
      catalog: items.catalog.filter(Boolean).map(i => i.key)
    }));
  }, [items, mounted]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const findContainer = (id: string) => {
    if (id === "priority" || id === "catalog") return id;
    if (items.priority.some(item => item?.key === id)) return "priority";
    if (items.catalog.some(item => item?.key === id)) return "catalog";
    return null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    const overId = over?.id as string;
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;
    setItems((prev) => {
      const activeItems = prev[activeContainer as keyof ContainerState];
      const overItems = prev[overContainer as keyof ContainerState];
      const activeIndex = activeItems.findIndex(i => i?.key === activeId);
      const overIndex = overItems.findIndex(i => i?.key === overId);
      return {
        ...prev,
        [activeContainer]: activeItems.filter(i => i?.key !== activeId),
        [overContainer]: [...overItems.slice(0, overIndex >= 0 ? overIndex : overItems.length), activeItems[activeIndex], ...overItems.slice(overIndex >= 0 ? overIndex : overItems.length)]
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    const overId = over?.id as string;
    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer || activeContainer !== overContainer) return;
    const container = activeContainer as keyof ContainerState;
    const activeIndex = items[container].findIndex(i => i?.key === activeId);
    const overIndex = items[container].findIndex(i => i?.key === overId);
    if (activeIndex !== overIndex) {
      setItems((prev) => ({ ...prev, [container]: arrayMove(prev[container], activeIndex, overIndex) }));
    }
  };

  if (!mounted) return <div className="min-h-screen bg-[#030303]" />;

  return (
    <section className="w-full py-20 px-10 bg-[#030303] min-h-screen selection:bg-emerald-500/30 selection:text-white relative overflow-hidden text-white">
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/5 blur-[150px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/5 blur-[150px] pointer-events-none" />
      
      <div className="max-w-[1900px] mx-auto relative z-10">
        <GlobalDashboard items={items} />
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div className="mb-24 px-4">
            <div className="flex items-center gap-6 mb-12 px-2">
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.6em] text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-4 py-2 rounded-full shadow-[0_0_40px_-10px_rgba(16,185,129,0.15)]">
                Priority Streams ({items.priority.length})
              </span>
              <div className="h-px flex-1 bg-white/[0.03]" />
            </div>
            <SortableContext id="priority" items={items.priority.filter(Boolean).map(i => i.key)} strategy={rectSortingStrategy}>
              <div className="grid gap-10 sm:grid-cols-2 min-h-[150px] p-8 bg-white/[0.01] rounded-[4rem] border border-dashed border-white/[0.04] transition-all duration-500">
                {items.priority.map((s) => s && <StrategyCard key={s.key} id={s.key} data={s} isFeatured={true} />)}
              </div>
            </SortableContext>
          </div>
          <div className="px-4">
            <div className="flex items-center gap-6 mb-12 px-2">
              <h2 className="font-mono text-[10px] font-black uppercase tracking-[0.5em] text-zinc-600 ml-4 italic">Engine Catalog ({items.catalog.length})</h2>
              <div className="h-px flex-1 bg-white/[0.03]" />
            </div>
            <SortableContext id="catalog" items={items.catalog.filter(Boolean).map(i => i.key)} strategy={rectSortingStrategy}>
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-h-[250px]">
                {items.catalog.map((s) => s && <StrategyCard key={s.key} id={s.key} data={s} isFeatured={false} />)}
              </div>
            </SortableContext>
          </div>
        </DndContext>
      </div>
    </section>
  );
}