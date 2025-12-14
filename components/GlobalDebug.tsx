"use client";
import { useEffect } from "react";

export default function GlobalDebug() {
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      // побачиш перший стек у консолі
      console.error("[GlobalError]", e.error || e.message || e);
    };
    const onRej = (e: PromiseRejectionEvent) => {
      console.error("[GlobalUnhandledRejection]", e.reason);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
  return null;
}
