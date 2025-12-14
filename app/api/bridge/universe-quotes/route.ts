// app/api/bridge/universe-quotes/route.ts
import { NextResponse } from "next/server";

/**
 * Схема B (локальний міст).
 *
 * ВАЖЛИВО:
 *   API routes на Vercel НЕ МОЖУТЬ звертатися до localhost:5197.
 *   Тому /api/bridge/* не використовується.
 *   Дані треба тягнути НАПРЯМУ з браузера:
 *
 *       fetch("http://localhost:5197/api/universe-quotes")
 *
 * Цей рут залишено лише як заглушку.
 */

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Схема B: цей endpoint не використовується. Звертайтесь напряму до локального TradingBridgeApi з клієнтського коду.",
      example: "fetch('http://localhost:5197/api/universe-quotes')",
    },
    { status: 410 } // Gone
  );
}
