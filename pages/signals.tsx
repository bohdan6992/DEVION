// pages/signals/index.tsx
import LiveStrategyTiles from "@/components/signals/LiveStrategyTiles";

export default function SignalsPage() {
  return (
    <main className="relative min-h-screen">
      {/* 
          Цей блок перекриває топбар. 
          mt-[-100px] піднімає його вгору, h-[100px] створює простір, 
          а z-50 гарантує, що він буде над навігацією.
      */}
      <div className="absolute top-[-100px] left-0 right-0 h-[100px] bg-[#030303] z-[40] pointer-events-none" />

      <div className="page space-y-6 relative z-10 pt-4">
        <header className="flex items-center justify-between">
          {/* Тут можна додати заголовок сторінки, якщо потрібно */}
        </header>

        <LiveStrategyTiles />
      </div>
    </main>
  );
}