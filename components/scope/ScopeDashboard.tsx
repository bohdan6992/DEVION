import PerformanceStats from "@/components/scope/PerformanceStats";
import CumsumChart from "@/components/scope/CumsumChart";
import DistributionChart from "@/components/scope/DistributionChart";
import BinsChart from "@/components/scope/BinsChart";
import SectorChart from "@/components/scope/SectorChart";

export default function ScopeDashboard({
  payloads,
}: {
  payloads: Record<string, any>;
}) {
  const perf = payloads?.perf;
  const cs = payloads?.cs;
  const dist = payloads?.dist;
  const bins = payloads?.bins;
  const sector = payloads?.sector;

  return (
    <div className="mt-8 space-y-8">
      {perf && <PerformanceStats data={perf} />}
      {cs && <CumsumChart data={cs} />}
      {dist && <DistributionChart data={dist} />}
      {sector && sector.rows?.length > 0 && <SectorChart data={sector} />}
      {bins && <BinsChart data={bins} />}
    </div>
  );
}
