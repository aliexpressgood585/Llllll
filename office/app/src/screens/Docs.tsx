import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, EmptyState, SearchInput, Select } from '../components/ui';
import { DOC_STATUS } from '../lib/constants';
import { ago, shortName } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import { usePersisted } from '../lib/usePersisted';

const DOC_TONE: Record<string, string> = { 'חסר קלט': 'needs', 'בעבודה': 'working', 'לבדיקה': 'review', 'הושלם': 'done' };

export function Docs() {
  const { data } = useOffice();
  const nav = useNav();
  const [f, setF] = usePersisted('docs:filters', { q: '', project: '', status: '' });
  const docs = useMemo(() => data.agents.flatMap((a) => (a.artifacts ?? []).map((d) => ({ ...d, agent: a, status: DOC_STATUS[a.status] })))
    .sort((x, y) => String(y.agent.updatedAt).localeCompare(String(x.agent.updatedAt))), [data.agents]);
  const list = docs.filter((d) => (!f.project || d.agent.project === f.project) && (!f.status || d.status === f.status) && (!f.q || `${d.title} ${d.agent.name}`.toLowerCase().includes(f.q.toLowerCase())));
  const pname = (id: string) => shortName(data.projects.find((p) => p.id === id)?.name ?? id);
  const filtered = f.q || f.project || f.status;
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">מסמכים</h1>
        <p className="mt-1 text-sm text-ink-2">{docs.length} מסמכים ודפים שהסוכנים פרסמו · הסטטוס נגזר מהמצב של הסוכן שיצר אותם</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="חיפוש מסמך או סוכן…" />
        <div className="w-44"><Select aria-label="סינון לפי פרויקט" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">כל הפרויקטים</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div className="w-36"><Select aria-label="סינון לפי סטטוס" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">כל הסטטוסים</option>{Object.keys(DOC_TONE).map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
        {filtered && <button type="button" className="text-sm text-primary hover:underline" onClick={() => setF({ q: '', project: '', status: '' })}>נקה סינון</button>}
      </div>
      {!list.length ? <Card><EmptyState icon="file" title={docs.length ? 'לא נמצאו מסמכים' : 'אין מסמכים עדיין'} text={docs.length ? 'נסה חיפוש או סינון אחר.' : 'כשסוכן יפרסם דף או מסמך, הוא יופיע כאן.'} action={filtered ? <Button onClick={() => setF({ q: '', project: '', status: '' })}>נקה סינון</Button> : undefined} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => (
            <Card key={d.url + d.agent.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name="file" /></span>
                <div className="min-w-0 flex-1">
                  <a href={d.url} target="_blank" rel="noopener" className="line-clamp-2 text-[15px] font-semibold hover:text-primary">{d.title}</a>
                  <div className="mt-0.5 text-[12.5px] text-muted">{pname(d.agent.project)} · {ago(d.agent.updatedAt)}</div>
                </div>
                <Badge tone={DOC_TONE[d.status]}>{d.status}</Badge>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
                <button type="button" className="truncate text-[13px] text-ink-2 hover:text-primary" onClick={() => nav.openAgent(d.agent.id)}>נוצר ע״י {d.agent.name}</button>
                <a href={d.url} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary hover:underline">פתח<Icon name="external" size={13} /></a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
