import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export default function handler(req: NextApiRequest, res: NextApiResponse){
  const { timestamp, folder } = req.query;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if(!api_key || !api_secret) return res.status(400).json({ ok:false, error:"Missing API credentials" });
  const params = new URLSearchParams();
  if (folder) params.append("folder", String(folder));
  params.append("timestamp", String(timestamp));
  const toSign = params.toString() + api_secret;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");
  return res.status(200).json({ ok:true, api_key, signature });
}
