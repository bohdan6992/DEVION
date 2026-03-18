"use client";

import React from "react";
import { useUi } from "@/components/UiProvider";
import ThemeStarfieldCanvas from "@/components/theme/ThemeStarfieldCanvas";
import InfernoThemeBackground from "@/components/theme/InfernoThemeBackground";
import NeonThemeBackground from "@/components/theme/NeonThemeBackground";
import BlackSpheresBackground from "@/components/theme/BlackSpheresBackground";
import RainThemeBackground from "@/components/theme/RainThemeBackground";
import SpaceThemeBackground from "@/components/theme/SpaceThemeBackground";

export default function AppThemeBackground() {
  const { theme } = useUi();

  if (theme === "inferno") {
    return <InfernoThemeBackground />;
  }

  if (theme === "neon") {
    return <NeonThemeBackground />;
  }

  if (theme === "dark") {
    return <BlackSpheresBackground />;
  }

  if (theme === "rain") {
    return <RainThemeBackground />;
  }

  if (theme === "space") {
    return <SpaceThemeBackground />;
  }

  return <ThemeStarfieldCanvas />;
}
