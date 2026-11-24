"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useUi } from "@/components/UiProvider";

// Themes are mutually exclusive. Keep their canvas/WebGL implementations out of the shared
// application chunk and download only the background the operator actually selected.
const ThemeStarfieldCanvas = dynamic(() => import("@/components/theme/ThemeStarfieldCanvas"), { ssr: false });
const InfernoThemeBackground = dynamic(() => import("@/components/theme/InfernoThemeBackground"), { ssr: false });
const NeonThemeBackground = dynamic(() => import("@/components/theme/NeonThemeBackground"), { ssr: false });
const BlackSpheresBackground = dynamic(() => import("@/components/theme/BlackSpheresBackground"), { ssr: false });
const RainThemeBackground = dynamic(() => import("@/components/theme/RainThemeBackground"), { ssr: false });
const SpaceThemeBackground = dynamic(() => import("@/components/theme/SpaceThemeBackground"), { ssr: false });
const MercuryThemeBackground = dynamic(() => import("@/components/theme/MercuryThemeBackground"), { ssr: false });
const FluidThemeBackground = dynamic(() => import("@/components/theme/FluidThemeBackground"), { ssr: false });
const MagmaThemeBackground = dynamic(() => import("@/components/theme/MagmaThemeBackground"), { ssr: false });
const OceanicThemeBackground = dynamic(() => import("@/components/theme/OceanicThemeBackground"), { ssr: false });
const KhakiThemeBackground = dynamic(() => import("@/components/theme/KhakiThemeBackground"), { ssr: false });
const ZebraThemeBackground = dynamic(() => import("@/components/theme/ZebraThemeBackground"), { ssr: false });
const FlamingoThemeBackground = dynamic(() => import("@/components/theme/FlamingoThemeBackground"), { ssr: false });
const MoneyThemeBackground = dynamic(() => import("@/components/theme/MoneyThemeBackground"), { ssr: false });
const MatrixThemeBackground = dynamic(() => import("@/components/theme/MatrixThemeBackground"), { ssr: false });

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

  if (theme === "fluid") {
    return <FluidThemeBackground />;
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

  if (theme === "matrix") {
    return <MatrixThemeBackground />;
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

  if (theme === "money") {
    return <MoneyThemeBackground />;
  }

  return <ThemeStarfieldCanvas />;
}
