import { useMemo } from 'react';
import { Icon } from '../components/Icon';
import { Avatar, Button, Card, EmptyState, SearchInput, Select, StatusBadge } from '../components/ui';
import { STAGES, STATUS, STATUS_PRIORITY } from '../lib/constants';
import { stageOf } from '../lib/derive';
import { ago, shortName, usd } from '../lib/format';
import { useNav } from '../lib/nav';
import { useOffice } from '../lib/store';
import type { Agent } from '../lib/types';
import { usePersisted } from '../lib/usePersisted';

type SortKey = 'name' | 'project' | 'status' | 'updatedAt' | 'costUsd';
const COLS: { key: SortKey; label: string; cls?: string }[] = [
  { key: 'name', label: 'סוכן' }, { key: 'project', label: 'פרויקט' }, { key: 'status', label: 'מצב' },
  { key: 'updatedAt', label: 'פעילות אחרונה' }, { key: 'costUsd', label: 'עלות', cls: 'text-end' },
];

export function Agents() {
  const { data } = useOffice();
  const nav = useNav();
  const [f, setF] = usePersisted('agents:filters', { q: '', status: '', project: '', model: '', sort: 'status' as SortKey, dir: 1 });
  const pname = (id: string) => data.projects.find((p) => p.id === id)?.name ?? id;
  const models = useMemo(() => [...new Set(data.agents.map((a) => a.model).filter(Boolean))].sort() as string[], [data.agents]);
  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const cmp: Record<SortKey, (a: Agent, b: Agent) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, 'he'),
      project: (a, b) => pname(a.project).localeCompare(pname(b.project), 'he'),
      status: (a, b) => STATUS_PRIORITY.indexOf(a.status) - STATUS_PRIORITY.indexOf(b.status) || String(b.updatedAt).localeCompare(String(a.updatedAt)),
      updatedAt: (a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)),
      costUsd: (a, b) => (a.costUsd ?? -1) - (b.costUsd ?? -1),
    };
    return data.agents
      .filter((a) => (!f.status || a.status === f.status) && (!f.project || a.project === f.project) && (!f.model || a.model === f.model))
      .filter((a) => !q || `${a.name} ${a.detail ?? ''} ${a.needsAction ?? ''} ${pname(a.project)}`.toLowerCase().includes(q))
      .sort((a, b) => cmp[f.sort](a, b) * f.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.agents, data.projects, f]);
  const sortBy = (key: SortKey) => setF({ ...f, sort: key, dir: f.sort === key ? -f.dir : key === 'updatedAt' || key === 'costUsd' ? -1 : 1 });
  const filtered = f.q || f.status || f.project || f.model;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">סוכנים</h1>
        <p className="mt-1 text-sm text-ink-2">{data.agents.length} סשנים של Claude Code · {data.agents.filter((a) => a.status === 'working').length} עובדים עכשיו · עלות כוללת {usd(data.agents.reduce((s, a) => s + (a.costUsd ?? 0), 0))}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-card">
        <SearchInput value={f.q} onChange={(q) => setF({ ...f, q })} placeholder="חיפוש בשם, בפרטים או במה שצריך ממך…" />
        <div className="w-40"><Select aria-label="סינון לפי מצב" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">כל המצבים</option>{STATUS_PRIORITY.map((s) => <option key={s} value={s}>{STATUS[s].he}</option>)}</Select></div>
        <div className="w-44"><Select aria-label="סינון לפי פרויקט" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })}><option value="">כל הפרויקטים</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
        <div className="w-44"><Select aria-label="סינון לפי מודל" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}><option value="">כל המודלים</option>{models.map((m) => <option key={m} value={m}>{m}</option>)}</Select></div>
        {filtered && <button type="button" className="text-sm text-primary hover:underline" onClick={() => setF({ ...f, q: '', status: '', project: '', model: '' })}>נקה סינון</button>}
      </div>
      <Card>
        {!rows.length ? <EmptyState icon="agent" title="לא נמצאו סוכנים" text="נסה לשנות את החיפוש או הסינון." action={filtered ? <Button onClick={() => setF({ ...f, q: '', status: '', project: '', model: '' })}>נקה סינון</Button> : undefined} /> : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-line text-[12.5px] text-muted">
                  {COLS.map((c) => (
                    <th key={c.key} scope="col" aria-sort={f.sort === c.key ? (f.dir > 0 ? 'ascending' : 'descending') : 'none'} className={`px-4 py-2.5 font-medium ${c.cls ?? 'text-start'}`}>
                      <button type="button" onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 hover:text-ink">{c.label}{f.sort === c.key && <Icon name={f.dir > 0 ? 'chevronDown' : 'chevronDown'} size={13} className={f.dir > 0 ? '' : 'rotate-180'} />}</button>
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">שלב הטיפול שלך</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => (
                  <tr key={a.id} onClick={() => nav.openAgent(a.id)} className="cursor-pointer hover:bg-surface-2">
                    <td className="max-w-[340px] px-4 py-3">
                      <button type="button" className="flex items-center gap-3 text-start" onClick={(e) => { e.stopPropagation(); nav.openAgent(a.id); }}>
                        <Avatar name={a.name} size={32} />
                        <span className="min-w-0"><span className="block truncate font-medium">{a.name}</span><span className={`block truncate text-[12.5px] ${a.needsAction ? 'text-needs' : 'text-muted'}`}>{a.needsAction ?? a.detail}</span></span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{shortName(pname(a.project))}</td>
                    <td className="px-4 py-3"><StatusBadge status={a.status} short /></td>
                    <td className="px-4 py-3 text-ink-2">{ago(a.updatedAt)}</td>
                    <td className="tnum px-4 py-3 text-end">{a.costUsd !== undefined ? usd(a.costUsd, 2) : '—'}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted">{['needs_input', 'failed', 'review'].includes(a.status) ? STAGES.find((s) => s.id === stageOf(data, a.id))!.he : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => nav.openAgent(a.id)} className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-2">
                    <Avatar name={a.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className="truncate font-medium">{a.name}</span><StatusBadge status={a.status} short /></span>
                      <span className="mt-0.5 block text-[12.5px] text-muted">{shortName(pname(a.project))} · {ago(a.updatedAt)}{a.costUsd !== undefined ? ` · ${usd(a.costUsd)}` : ''}</span>
                      {a.needsAction && <span className="mt-1 block text-[12.5px] text-needs">{a.needsAction}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
