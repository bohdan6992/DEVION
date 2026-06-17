"use client";

import React from "react";
import { useUi } from "@/components/UiProvider";
import ThemeStarfieldCanvas from "@/components/theme/ThemeStarfieldCanvas";
import InfernoThemeBackground from "@/components/theme/InfernoThemeBackground";
import NeonThemeBackground from "@/components/theme/NeonThemeBackground";
import BlackSpheresBackground from "@/components/theme/BlackSpheresBackground";
import RainThemeBackground from "@/components/theme/RainThemeBackground";
import SpaceThemeBackground from "@/components/theme/SpaceThemeBackground";
import MercuryThemeBackground from "@/components/theme/MercuryThemeBackground";
import MagmaThemeBackground from "@/components/theme/MagmaThemeBackground";
import OceanicThemeBackground from "@/components/theme/OceanicThemeBackground";
import KhakiThemeBackground from "@/components/theme/KhakiThemeBackground";
import ZebraThemeBackground from "@/components/theme/ZebraThemeBackground";
import FlamingoThemeBackground from "@/components/theme/FlamingoThemeBackground";

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

  if (theme === "mercury") {
    return <MercuryThemeBackground />;
  }

  if (theme === "magma") {
    return <MagmaThemeBackground />;
  }

  if (theme === "oceanic") {
    return <OceanicThemeBackground />;
  }

  if (theme === "khaki") {
    return <KhakiThemeBackground />;
  }

  if (theme === "zebra") {
    return <ZebraThemeBackground />;
  }

  if (theme === "flamingo") {
    return <FlamingoThemeBackground />;
  }

  return <ThemeStarfieldCanvas />;
}
