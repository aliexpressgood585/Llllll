import { useMemo, useState } from 'react';
import { BarChart, DataTable, HBarChart, PartsBar } from '../components/charts';
import { Button, Card, CardHeader, Segmented, useToast } from '../components/ui';
import { STATUS, STATUS_PRIORITY } from '../lib/constants';
import { inPeriod, projectViews, stageOf, tasksDoneByWeek, toCsv, waitingOnYou, type Period } from '../lib/derive';
import { daysSince, shortName, todayISO, usd } from '../lib/format';
import { useOffice } from '../lib/store';
import { usePersisted } from '../lib/usePersisted';

const COLOR: Record<string, string> = { working: 'var(--working)', needs_input: 'var(--needs)', failed: 'var(--failed)', review: 'var(--review)', done: 'var(--done)' };

function Toggle({ table, set }: { table: boolean; set: (v: boolean) => void }) {
  return <Segmented label="תצוגה" value={table ? 'table' : 'chart'} onChange={(v) => set(v === 'table')} options={[{ value: 'chart', label: 'גרף' }, { value: 'table', label: 'טבלה' }]} />;
}

export function Reports() {
  const { data, actions } = useOffice();
  const toast = useToast();
  const [period, setPeriod] = usePersisted<Period>('reports:period', 0);
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const tbl = (k: string) => !!tables[k];
  const setTbl = (k: string) => (v: boolean) => setTables((t) => ({ ...t, [k]: v }));
  const agents = useMemo(() => data.agents.filter((a) => inPeriod(a.updatedAt, period)), [data.agents, period]);
  const views = useMemo(() => projectViews({ ...data, agents }), [data, agents]);
  const status = STATUS_PRIORITY.map((s) => ({ key: s, label: STATUS[s].he, value: agents.filter((a) => a.status === s).length, color: COLOR[s], icon: STATUS[s].icon }));
  const costByProject = views.filter((v) => v.cost > 0).sort((a, b) => b.cost - a.cost).map((v) => ({ label: shortName(v.project.name), value: Math.round(v.cost * 100) / 100 }));
  const byModel = Object.entries(agents.reduce<Record<string, number>>((m, a) => { const k = a.model ?? 'לא ידוע'; m[k] = (m[k] ?? 0) + (a.costUsd ?? 0); return m; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  const weekly = tasksDoneByWeek(data.tasks, 8).map((w) => ({ label: w.label, value: w.count }));
  const waits = waitingOnYou(data).map((a) => ({ label: a.name.length > 22 ? a.name.slice(0, 21) + '…' : a.name, value: Math.round(daysSince(a.updatedAt)) })).sort((a, b) => b.value - a.value);
  const total = agents.reduce((s, a) => s + (a.costUsd ?? 0), 0);

  const exportCsv = async () => {
    const rows: (string | number | undefined)[][] = [['סוכן', 'פרויקט', 'מצב', 'שלב טיפול', 'מה צריך ממך', 'מודל', 'עלות ($)', 'עדכון אחרון', 'ימים מאז']];
    for (const a of agents) rows.push([a.name, data.projects.find((p) => p.id === a.project)?.name ?? a.project, STATUS[a.status].he, stageOf(data, a.id), a.needsAction, a.model, a.costUsd?.toFixed(2), a.updatedAt, Math.round(daysSince(a.updatedAt))]);
    const r = await actions.exportFile(`agents-report-${todayISO()}.csv`, toCsv(rows));
    toast(r === 'saved' ? { tone: 'success', text: 'הדוח ירד כקובץ CSV' } : r === 'copied' ? { tone: 'info', text: 'ההורדה לא זמינה כאן — הדוח הועתק ללוח' } : { tone: 'error', text: 'הייצוא בוטל או נכשל' });
  };
  const exportTasks = async () => {
    const rows: (string | number | undefined)[][] = [['משימה', 'פרויקט', 'עדיפות', 'יעד', 'הושלמה', 'נוצרה', 'הושלמה ב']];
    for (const t of data.tasks) rows.push([t.title, data.projects.find((p) => p.id === t.project)?.name, t.priority, t.due, t.done ? 'כן' : 'לא', t.createdAt, t.completedAt]);
    const r = await actions.exportFile(`tasks-${todayISO()}.csv`, toCsv(rows));
    toast(r === 'saved' ? { tone: 'success', text: 'המשימות ירדו כקובץ CSV' } : r === 'copied' ? { tone: 'info', text: 'ההורדה לא זמינה כאן — הטבלה הועתקה ללוח' } : { tone: 'error', text: 'הייצוא בוטל או נכשל' });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">דוחות</h1>
          <p className="mt-1 text-sm text-ink-2">{agents.length} סוכנים בתקופה · עלות {usd(total)} · לפי עדכון אחרון של כל סשן</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="תקופה" value={period} onChange={setPeriod} options={[{ value: 7, label: '7 ימים' }, { value: 30, label: '30 יום' }, { value: 90, label: '90 יום' }, { value: 0, label: 'הכל' }]} />
          <Button icon="download" onClick={exportCsv}>ייצוא סוכנים</Button>
          <Button icon="download" onClick={exportTasks}>ייצוא משימות</Button>
        </div>
      </div>
      <Card>
        <CardHeader icon="chart" title="התפלגות מצבים" subtitle="כמה סוכנים בכל מצב" actions={<Toggle table={tbl('s')} set={setTbl('s')} />} />
        <div className="p-5">{tbl('s') ? <DataTable columns={['מצב', 'סוכנים']} rows={status.map((s) => [s.label, s.value])} /> : <PartsBar parts={status} label="התפלגות מצבי הסוכנים" />}</div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon="dollar" title="עלות לפי פרויקט" actions={<Toggle table={tbl('c')} set={setTbl('c')} />} />
          <div className="p-5">{!costByProject.length ? <p className="py-6 text-center text-[13px] text-muted">אין עלויות בתקופה.</p> : tbl('c') ? <DataTable columns={['פרויקט', 'עלות']} rows={costByProject.map((c) => [c.label, usd(c.value, 2)])} /> : <HBarChart data={costByProject} format={(v) => usd(v)} label="עלות לפי פרויקט" />}</div>
        </Card>
        <Card>
          <CardHeader icon="agent" title="עלות לפי מודל" actions={<Toggle table={tbl('m')} set={setTbl('m')} />} />
          <div className="p-5">{!byModel.length ? <p className="py-6 text-center text-[13px] text-muted">אין נתונים בתקופה.</p> : tbl('m') ? <DataTable columns={['מודל', 'עלות']} rows={byModel.map((c) => [c.label, usd(c.value, 2)])} /> : <HBarChart data={byModel} format={(v) => usd(v)} label="עלות לפי מודל" />}</div>
        </Card>
        <Card>
          <CardHeader icon="tasks" title="משימות שהושלמו בכל שבוע" subtitle="8 השבועות האחרונים" actions={<Toggle table={tbl('w')} set={setTbl('w')} />} />
          <div className="p-5">{tbl('w') ? <DataTable columns={['שבוע', 'הושלמו']} rows={weekly.map((w) => [w.label, w.value])} /> : <BarChart data={weekly} unit="משימות" label="משימות שהושלמו בכל שבוע" />}</div>
        </Card>
        <Card>
          <CardHeader icon="clock" title="כמה זמן כל פריט מחכה לך" subtitle="בימים, מהעדכון האחרון של הסוכן" actions={<Toggle table={tbl('t')} set={setTbl('t')} />} />
          <div className="p-5">{!waits.length ? <p className="py-6 text-center text-[13px] text-muted">שום דבר לא מחכה לך.</p> : tbl('t') ? <DataTable columns={['סוכן', 'ימים']} rows={waits.map((w) => [w.label, w.value])} /> : <HBarChart data={waits} format={(v) => `${v} ימים`} label="ימי המתנה לכל פריט" />}</div>
        </Card>
      </div>
    </div>
  );
}
