import { useMemo, useState } from 'react';
import { BarChart, DataTable } from '../components/charts';
import { Icon } from '../components/Icon';
import { TaskMiniList } from '../components/overlays';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ProgressBar, Segmented, StatusBadge, StatusDot } from '../components/ui';
import { STAGES } from '../lib/constants';
import { activityByDay, goals, inPeriod, projectViews, stageOf, taskBuckets, waitingOnYou, type Period } from '../lib/derive';
import { ago, daysSince, dateHe, shortName, todayISO, usd } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import { usePersisted } from '../lib/usePersisted';

function greeting() {
  const h = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date());
  return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
}

function Kpi({ label, value, sub, icon, tone, onClick }: { label: string; value: string | number; sub?: string; icon: string; tone: string; onClick?: () => void }) {
  const tones: Record<string, string> = { needs: 'bg-needs-soft text-needs', working: 'bg-working-soft text-working', review: 'bg-review-soft text-review', done: 'bg-done-soft text-done', primary: 'bg-primary-soft text-primary', accent: 'bg-accent-soft text-accent', failed: 'bg-failed-soft text-failed' };
  return (
    <button type="button" onClick={onClick} className="group rounded-2xl border border-line bg-surface p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop focus-visible:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}><Icon name={icon} size={16} /></span>
      </div>
      <div className="tnum mt-2 text-[28px] font-bold leading-none tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-2 text-[12.5px] text-muted">{sub}</div>}
    </button>
  );
}

export function Dashboard() {
  const { data } = useOffice();
  const nav = useNav();
  const [period, setPeriod] = usePersisted<Period>('dash:period', 30);
  const [tableView, setTableView] = useState(false);
  const views = useMemo(() => projectViews(data), [data]);
  const waiting = waitingOnYou(data);
  const buckets = taskBuckets(data.tasks);
  const inP = data.agents.filter((a) => inPeriod(a.updatedAt, period));
  const working = data.agents.filter((a) => a.status === 'working');
  const review = data.agents.filter((a) => a.status === 'review' && stageOf(data, a.id) !== 'handled');
  const doneP = inP.filter((a) => a.status === 'done');
  const costP = inP.reduce((s, a) => s + (a.costUsd ?? 0), 0);
  const chartDays = period === 0 ? 90 : period;
  const activity = activityByDay(data.agents, chartDays).map((d) => ({ label: d.label, value: d.count, hint: dateHe(d.day, true) }));
  const g = goals(data);
  const upcoming = [
    ...data.tasks.filter((t) => !t.done && t.due && t.due > todayISO() && t.due <= todayISO(7)).map((t) => ({ key: t.id, date: t.due!, title: t.title, kind: 'משימה', open: () => nav.editTask(t) })),
    ...views.filter((v) => v.followUp && v.followUp >= todayISO() && v.followUp <= todayISO(14)).map((v) => ({ key: `f${v.project.id}`, date: v.followUp!, title: `מעקב: ${v.project.name}`, kind: 'מעקב', open: () => nav.go({ screen: 'project', id: v.project.id }) })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  const summary = [
    waiting.length ? `${waiting.length} פריטים מחכים לך` : 'אף סוכן לא מחכה לך',
    working.length ? `${working.length} סוכנים עובדים עכשיו` : null,
    buckets.overdue.length ? `${buckets.overdue.length} משימות באיחור` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">{greeting()}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="תקופה" value={period} onChange={setPeriod} options={[{ value: 7 as Period, label: '7 ימים' }, { value: 30 as Period, label: '30 ימים' }, { value: 90 as Period, label: '90 ימים' }, { value: 0 as Period, label: 'הכל' }]} />
          <Button variant="primary" icon="plus" onClick={() => nav.editTask()}>משימה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="מחכים לך" value={waiting.length} icon="hand" tone="needs" sub={waiting.length ? `הכי ותיק: ${ago(waiting[0].updatedAt)}` : 'הכל מטופל'} onClick={() => nav.go({ screen: 'board' })} />
        <Kpi label="עובדים עכשיו" value={working.length} icon="bolt" tone="working" sub={working.map((a) => shortName(a.name)).join(', ') || 'אין סוכן פעיל'} onClick={() => nav.go({ screen: 'agents' })} />
        <Kpi label="מוכנים לבדיקה" value={review.length} icon="eye" tone="review" sub="עבודה שמחכה לאישור שלך" onClick={() => nav.go({ screen: 'board' })} />
        <Kpi label="משימות להיום" value={buckets.today.length + buckets.overdue.length} icon="tasks" tone={buckets.overdue.length ? 'failed' : 'primary'} sub={buckets.overdue.length ? `${buckets.overdue.length} באיחור` : `${buckets.week.length} בהמשך השבוע`} onClick={() => nav.go({ screen: 'tasks' })} />
        <Kpi label={period ? `הושלמו ב-${period} ימים` : 'הושלמו (הכל)'} value={doneP.length} icon="check" tone="done" sub={`${inP.length} סוכנים פעילים בתקופה`} onClick={() => nav.go({ screen: 'agents' })} />
        <Kpi label="עלות סוכנים" value={usd(costP)} icon="dollar" tone="accent" sub={period ? `סוכנים שעבדו ב-${period} ימים` : 'מצטבר מכל הזמנים'} onClick={() => nav.go({ screen: 'reports' })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader icon="chart" title="פעילות סוכנים" subtitle={`סוכנים לפי יום הפעילות האחרון · ${chartDays} ימים אחרונים`}
            actions={<Button size="sm" variant="ghost" icon={tableView ? 'chart' : 'list'} onClick={() => setTableView((v) => !v)}>{tableView ? 'הצג גרף' : 'הצג כטבלה'}</Button>} />
          <div className="p-5">
            {tableView ? <DataTable columns={['יום', 'סוכנים פעילים']} rows={activity.filter((a) => a.value).map((a) => [a.hint ?? a.label, a.value])} />
              : <BarChart data={activity} unit="סוכנים" label="מספר הסוכנים לפי יום הפעילות האחרון" height={210} />}
          </div>
        </Card>
        <Card>
          <CardHeader icon="target" title="יעדים" subtitle="כמה מהר אתה מגיב לסוכנים" actions={<Button size="sm" variant="ghost" onClick={() => nav.go({ screen: 'goals' })}>עריכה</Button>} />
          <ul className="grid gap-4 p-5">
            {g.map((x) => (
              <li key={x.id} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="text-ink-2">{x.label}</span>
                  <span className="inline-flex items-center gap-1.5"><b className="tnum">{x.fmt}</b><Badge tone={x.ok ? 'working' : 'failed'} icon={x.ok ? 'check' : 'alert'}>{x.ok ? 'ביעד' : 'חורג'}</Badge></span>
                </div>
                <ProgressBar value={x.progress} tone={x.ok ? 'working' : 'failed'} label={x.label} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader icon="hand" title="מחכים לך" subtitle="מהוותיק לחדש" actions={<Button size="sm" variant="ghost" onClick={() => nav.go({ screen: 'board' })}>ללוח הטיפול</Button>} />
          {waiting.length ? (
            <ul className="divide-y divide-line">
              {waiting.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => nav.openAgent(a.id)} className="flex w-full items-start gap-3 px-5 py-3 text-start hover:bg-surface-2">
                    <Avatar name={shortName(data.projects.find((p) => p.id === a.project)?.name ?? a.project)} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.name}</span>
                      <span className="line-clamp-2 text-[12.5px] text-needs">{a.needsAction ?? a.detail}</span>
                      <span className="mt-0.5 block text-[12px] text-muted">{STAGES.find((s) => s.id === stageOf(data, a.id))!.he} · מחכה {Math.round(daysSince(a.updatedAt))} ימים</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="check" title="אין מה לענות" text="כל הסוכנים שחיכו לך טופלו." />}
        </Card>
        <Card>
          <CardHeader icon="tasks" title="משימות להיום" subtitle={buckets.overdue.length ? `כולל ${buckets.overdue.length} באיחור` : 'מה שקבעת להיום'} actions={<Button size="sm" variant="ghost" icon="plus" onClick={() => nav.editTask({ due: todayISO() })}>הוסף</Button>} />
          <div className="p-4">
            {buckets.overdue.length + buckets.today.length ? <TaskMiniList tasks={[...buckets.overdue, ...buckets.today]} showProject />
              : <EmptyState icon="check" title="אין משימות להיום" text="אפשר לתכנן את היום — או לקחת משימה מהשבוע." action={<Button size="sm" icon="plus" onClick={() => nav.editTask({ due: todayISO() })}>משימה להיום</Button>} />}
          </div>
        </Card>
        <Card>
          <CardHeader icon="calendar" title="בקרוב" subtitle="משימות ומעקבים בשבועיים הקרובים" actions={<Button size="sm" variant="ghost" onClick={() => nav.go({ screen: 'tasks' })}>ללוח השנה</Button>} />
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((u) => (
                <li key={u.key}>
                  <button type="button" onClick={u.open} className="flex w-full items-center gap-3 px-5 py-3 text-start hover:bg-surface-2">
                    <span className="grid w-12 shrink-0 place-items-center rounded-lg bg-surface-2 py-1 text-center">
                      <span className="tnum text-base font-bold leading-tight">{new Date(`${u.date}T12:00:00`).getDate()}</span>
                      <span className="text-[11px] text-muted">{new Date(`${u.date}T12:00:00`).toLocaleDateString('he-IL', { weekday: 'short' })}</span>
                    </span>
                    <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm">{u.title}</span><span className="text-[12px] text-muted">{u.kind}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon="calendar" title="השבועיים הקרובים פנויים" text="קבע תאריך מעקב לפרויקט או תאריך יעד למשימה." />}
        </Card>
      </div>

      <Card>
        <CardHeader icon="folder" title="ביצועי פרויקטים" subtitle="מצב, עומס ועלות לכל פרויקט" actions={<Button size="sm" variant="ghost" onClick={() => nav.go({ screen: 'projects' })}>כל הפרויקטים</Button>} />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-[12.5px] text-muted">
              <tr className="[&>th]:px-5 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium"><th>פרויקט</th><th>מצב</th><th>סוכנים</th><th>מחכים לך</th><th>משימות פתוחות</th><th>עלות</th><th>פעילות אחרונה</th></tr>
            </thead>
            <tbody>
              {[...views].sort((a, b) => b.attention - a.attention || String(b.last).localeCompare(String(a.last))).map((v) => (
                <tr key={v.project.id} className="cursor-pointer border-t border-line hover:bg-surface-2 [&>td]:px-5 [&>td]:py-3" onClick={() => nav.go({ screen: 'project', id: v.project.id })}>
                  <td><button type="button" className="flex items-center gap-2.5 text-start font-medium hover:text-primary" onClick={(e) => { e.stopPropagation(); nav.go({ screen: 'project', id: v.project.id }); }}><Avatar name={shortName(v.project.name)} size={26} />{v.project.name}</button></td>
                  <td><StatusBadge status={v.status} short /></td>
                  <td className="tnum">{v.agents.length}</td>
                  <td>{v.attention ? <Badge tone="needs">{v.attention}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="tnum">{v.openTasks || <span className="text-muted">—</span>}</td>
                  <td className="tnum">{v.cost ? usd(v.cost) : <span className="text-muted">—</span>}</td>
                  <td className="text-ink-2"><span className="inline-flex items-center gap-1.5"><StatusDot status={v.status} />{ago(v.last)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
