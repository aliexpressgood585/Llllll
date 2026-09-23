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
import { LiveMarket } from './components/LiveMarket';
import { useDesk } from './hooks/useDesk';

export default function App() {
  const [s, controls] = useDesk();
  return (
    <div className="mx-auto flex min-h-screen max-w-[2200px] flex-col gap-2 p-2">
      <LiveMarket />
      {s.source.mode === 'sim' ? (
        <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm text-warn">מעבדת סימולציה נפרדת · כל הנתונים למטה סינתטיים, כולל רווחים, חיסולים ושרשרת אופציות. זו אינה בדיקה היסטורית על Binance.</div>
      ) : (
        <div className="rounded-lg border border-up/30 bg-up/5 p-3 text-sm text-up">מסחר על נייר בנתונים חיים · מחירים, תנודתיות ושרשרת האופציות למטה מגיעים מ-Deribit בזמן אמת, והחיסולים מ-Binance. העסקאות מדומות — שום פקודה לא נשלחת לבורסה.</div>
      )}
      <BlowupBanner s={s} />
      {controls.connecting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/85 backdrop-blur-sm">
          <div className="rounded-[3px] border border-line bg-panel px-8 py-6 text-center">
            <div className="pulse-dot mx-auto mb-3 h-3 w-3 rounded-full bg-accent" />
            <div className="text-[15px] font-semibold text-white">מתחבר לנתוני שוק חיים…</div>
            <div className="mt-1 text-[11px] text-dim">Deribit: שרשרת אופציות, מדדים, מימון ו-DVOL · Binance: זרם חיסולים</div>
            <button onClick={() => controls.setMode('sim')} className="mt-4 rounded-[3px] border border-line2 px-3 py-1 text-[11px] text-dim hover:text-white">
              עבור לסימולציה
            </button>
          </div>
        </div>
      )}
      {controls.fallbackReason && (
        <div className="flex items-center justify-between gap-3 rounded-[3px] border border-warn/40 bg-warn/10 px-3 py-2 text-[11.5px] text-warn">
          <span>{controls.fallbackReason}</span>
          <button onClick={() => controls.setMode('live')} className="shrink-0 rounded-[3px] border border-warn/50 px-2 py-0.5 font-semibold hover:bg-warn/20">
            נסה שוב
          </button>
        </div>
      )}
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

      <footer className="pb-1 text-center text-[9.5px] text-muted">
        {s.source.mode === 'live'
          ? 'נתונים חיים מ-Deribit (אופציות, מדדים, מימון, DVOL) וזרם החיסולים הציבורי של Binance. כל העסקאות הן מסחר על נייר — שום פקודה לא נשלחת לבורסה. מפת המינוף היא הערכה. אין לראות בכך ייעוץ השקעות.'
          : 'סימולציה בלבד — שוק סינתטי (דיפוזיה עם קפיצות ומעברי משטר + מפלי חיסולים בפרפטואלים), משטח Black-Scholes, מבנה עמלות Binance/Deribit, החלקה והשהיה. אין לראות בכך ייעוץ השקעות.'}
      </footer>
    </div>
  );
}

