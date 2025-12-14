// pages/api/mood.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Driver = { key:string; label:string; value:number; note?:string };
type MoodPayload = { ts:string; score:number; drivers:Driver[] };

/** Допоміжник: зводимо -1..+1 в -100..+100 */
const toScore = (v:number) => Math.max(-100, Math.min(100, Math.round(v*100)));

export default async function handler(req: NextApiRequest, res: NextApiResponse<MoodPayload>) {
  // TODO: заміни mock на реальні джерела (quotes, put/call, VIX, breadth, sectors…)
  // Приклад: спробуємо прийняти значення з query (для швидких експериментів)
  const q = (k:string, def:number) => (req.query[k] ? Number(req.query[k]) : def);

  // Вхідні фактори як -1..+1 (чим більше, тим більше risk-on)
  const vix      = q("vix",     -0.20); // високий VIX => risk-off (негативний вклад)
  const breadth  = q("breadth",  0.25); // ширина ринку (adv/decl)
  const sectors  = q("sectors",  0.15); // ротація в циклічні/техно
  const crypto   = q("crypto",   0.10); // бета-сигнал
  const pcr      = q("pcr",     -0.05); // високий put/call => risk-off
  const rates    = q("rates",   -0.05); // зростання дохідностей => risk-off
  const flows    = q("flows",    0.10); // притоки в ETF ризикові
  const credit   = q("credit",   0.05); // спреди кредиту звужуються => risk-on

  const drivers: Driver[] = [
    { key:"vix",     label:"VIX",           value: vix,     note: "Зростання волатильності → risk-off" },
    { key:"breadth", label:"Breadth",       value: breadth, note: "Перевага зростаючих акцій" },
    { key:"sectors", label:"Sectors",       value: sectors, note: "Тех/циклічні > захисні" },
    { key:"crypto",  label:"Crypto Beta",   value: crypto },
    { key:"pcr",     label:"Put/Call",      value: pcr,     note: "Більше put → обережність" },
    { key:"rates",   label:"Rates",         value: rates,   note: "Вищі дохідності → тиск на risk" },
    { key:"flows",   label:"ETF Flows",     value: flows },
    { key:"credit",  label:"Credit Spreads",value: credit },
  ];

  // ваги (можеш підкрутити)
  const W: Record<string, number> = {
    vix: 0.22, breadth: 0.18, sectors: 0.15, crypto: 0.10,
    pcr: 0.12, rates: 0.10, flows: 0.08, credit: 0.05
  };

  const raw = drivers.reduce((acc, d) => acc + (W[d.key] ?? 0.1) * d.value, 0);
  const score = toScore(raw); // -100..100

  const payload: MoodPayload = {
    ts: new Date().toISOString(),
    score,
    drivers
  };
  res.status(200).json(payload);
}
