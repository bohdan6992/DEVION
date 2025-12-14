import type { NextApiRequest, NextApiResponse } from "next";
import { pool } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS strategies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        strategy_id INT REFERENCES strategies(id) ON DELETE CASCADE,
        ticker TEXT NOT NULL,
        trade_date DATE NOT NULL,
        entry_amount NUMERIC,
        result NUMERIC,
        screenshot_url TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // seed 3 strategies if empty
    const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM strategies`);
    if (rows[0].c === 0){
      await client.query(`
        INSERT INTO strategies (name, description, icon) VALUES
        ('BuyTheDeep','Покупка після різкого відкату.','/images/light/strategies/buythedeep.png'),
        ('PumpAndDumb','Імпульсний зліт і різкий скидання.','/images/light/strategies/pumpanddumb.png'),
        ('OpenBreckout','Пробій на відкритті сесії.','/images/light/strategies/openbreckout.png');
      `);
    }
    res.status(200).json({ ok:true });
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ ok:false, error: e.message });
  } finally {
    client.release();
  }
}
