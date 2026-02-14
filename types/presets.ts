export type PresetScope = "SONAR" | "SCANER" | "BOTH";
export type PresetKind = "ARBITRAGE"; // can extend later

export type PresetDto = {
  id: string;
  kind: PresetKind | string;
  scope: PresetScope | string;
  name: string;
  configJson: string;
  updatedUtc: string;
};

export type PresetUpsertRequestDto = {
  kind: PresetKind | string;
  scope: PresetScope | string;
  name: string;
  configJson: string;
};