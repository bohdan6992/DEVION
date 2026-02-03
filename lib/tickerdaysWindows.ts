// lib/tickerdaysWindows.ts

export type TickerdaysWindow = {
  id: number;
  name: string;
  minuteFrom: number;
  minuteTo: number;
};

export const TICKERDAYS_WINDOWS: TickerdaysWindow[] = [
  { id: 0, name: "OPEN 09:30-10:00", minuteFrom: 0, minuteTo: 30 },
  { id: 1, name: "OPEN 09:30-10:15", minuteFrom: 0, minuteTo: 45 },
  { id: 2, name: "OPEN 09:30-10:30", minuteFrom: 0, minuteTo: 60 },
  { id: 3, name: "INTRA 10:00-12:00", minuteFrom: 30, minuteTo: 150 },
  { id: 4, name: "DAY 09:30-16:00", minuteFrom: 0, minuteTo: 390 },
];

export function windowName(id: number | null | undefined): string {
  const w = TICKERDAYS_WINDOWS.find(x => x.id === id);
  return w?.name ?? `Window ${id ?? "?"}`;
}
