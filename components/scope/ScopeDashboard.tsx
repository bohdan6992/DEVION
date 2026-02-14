import PerformanceStats from "@/components/scope/PerformanceStats";
import CumsumChart from "@/components/scope/CumsumChart";
import DistributionChart from "@/components/scope/DistributionChart";
import BinsChart from "@/components/scope/BinsChart";

export default function ScopeDashboard({
  payloads,
}: {
  payloads: Record<string, any>;
}) {
  const perf = payloads?.perf;
  const cs = payloads?.cs;
  const dist = payloads?.dist;
  const bins = payloads?.bins;

  return (
    <div className="mt-8 space-y-8">
      {perf && <PerformanceStats data={perf} />}
      {cs && <CumsumChart data={cs} />}
      {dist && <DistributionChart data={dist} />}
      {bins && <BinsChart data={bins} />}
    </div>
  );
}
