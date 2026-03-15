"use client";

import React from "react";
import { useUi } from "@/components/UiProvider";
import ThemeStarfieldCanvas from "@/components/theme/ThemeStarfieldCanvas";
import InfernoThemeBackground from "@/components/theme/InfernoThemeBackground";
import NeonThemeBackground from "@/components/theme/NeonThemeBackground";

export default function AppThemeBackground() {
  const { theme } = useUi();

  if (theme === "inferno") {
    return <InfernoThemeBackground />;
  }

  if (theme === "neon") {
    return <NeonThemeBackground />;
  }

  return <ThemeStarfieldCanvas />;
}
