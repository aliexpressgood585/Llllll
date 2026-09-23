import { ActiveStrategies } from './components/ActiveStrategies';
import { AlertFeed } from './components/AlertFeed';
import { GreekAllocation, StrategyAllocation } from './components/AllocationPanels';
import { BlowupBanner } from './components/BlowupOverlay';
import { EquityCurve } from './components/EquityCurve';
import { ExecutionQuality, SystemHealth } from './components/ExecSystem';
import { GexPanel } from './components/GexPanel';
import { GreeksSummary } from './components/GreeksSummary';
import { Header } from './components/Header';
import { IvSurface } from './components/IvSurface';
import { LiquidationPanel } from './components/LiquidationPanel';
import { OptionsChain } from './components/OptionsChain';
import { PerformancePanel } from './components/PerformancePanel';
import { RegimePanel } from './components/RegimePanel';
import { RiskDashboard } from './components/RiskDashboard';
import { ScenarioPanel } from './components/ScenarioPanel';
import { TradeBlotter } from './components/TradeBlotter';
import { VolRegimePanel } from './components/VolRegimePanel';
import { useDesk } from './hooks/useDesk';

export default function App() {
  const [s, controls] = useDesk();
  return (
    <div className="mx-auto flex min-h-screen max-w-[2200px] flex-col gap-2 p-2">
      <BlowupBanner s={s} />
      <Header s={s} c={controls} />

      <main className="grid grid-cols-1 gap-2 xl:grid-cols-24">
        <div className="flex flex-col gap-2 xl:col-span-5">
          <RegimePanel s={s} />
          <IvSurface s={s} />
          <GexPanel s={s} />
          <VolRegimePanel s={s} />
        </div>

        <div className="flex min-w-0 flex-col gap-2 xl:col-span-12">
          <OptionsChain s={s} />
          <GreeksSummary s={s} />
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <ActiveStrategies s={s} />
            <ScenarioPanel s={s} />
          </div>
          <LiquidationPanel s={s} />
        </div>

        <div className="flex flex-col gap-2 xl:col-span-7">
          <RiskDashboard s={s} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <StrategyAllocation s={s} />
            <GreekAllocation s={s} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <ExecutionQuality s={s} />
            <SystemHealth s={s} />
          </div>
          <PerformancePanel s={s} />
        </div>
      </main>

      <section className="grid grid-cols-1 gap-2 xl:grid-cols-24">
        <div className="xl:col-span-7">
          <EquityCurve s={s} />
        </div>
        <div className="min-w-0 xl:col-span-10">
          <TradeBlotter s={s} />
        </div>
        <div className="xl:col-span-7">
          <AlertFeed s={s} />
        </div>
      </section>

      <footer className="num pb-1 text-center text-[9.5px] text-muted">
        SIMULATION ONLY — synthetic market (regime-switching jump-diffusion + perp liquidation cascades), Black-Scholes surface, Binance/Deribit fee schedule, book-walk slippage & latency. Not financial advice.
      </footer>
    </div>
  );
}
