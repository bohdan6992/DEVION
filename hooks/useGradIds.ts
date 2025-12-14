// hooks/useGradIds.ts
import { useId } from "react";
import { useUi } from "@/components/UiProvider";

/**
 * Генератор унікальних id для <defs> / gradient тощо.
 * Повертає функцію: (name) => `${scope}-${theme}-${uid}-${name}`
 */
export function useGradIds(scope = "g") {
  const { theme } = useUi();
  const uid = useId().replace(/[:]/g, "");
  return (name: string) => `${scope}-${theme}-${uid}-${name}`;
}
