import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, Field, ProgressBar, TextInput, useToast } from '../components/ui';
import { goals } from '../lib/derive';
import { useOffice } from '../lib/store';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';

const RULES: Record<keyof Settings, { label: string; hint: string; min: number; max: number }> = {
  maxWaiting: { label: 'כמה פריטים מותר שיחכו לך בו-זמנית', hint: 'בין 0 ל-50', min: 0, max: 50 },
  maxWaitDays: { label: 'כמה ימים מקסימום פריט יחכה לך', hint: 'בין 1 ל-60', min: 1, max: 60 },
  weeklyTasks: { label: 'יעד משימות שהושלמו בשבוע', hint: 'בין 1 ל-200', min: 1, max: 200 },
};

export function Goals() {
  const { data, actions } = useOffice();
  const toast = useToast();
  const [form, setForm] = useState<Record<keyof Settings, string>>(() => ({ maxWaiting: String(data.settings.maxWaiting), maxWaitDays: String(data.settings.maxWaitDays), weeklyTasks: String(data.settings.weeklyTasks) }));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm({ maxWaiting: String(data.settings.maxWaiting), maxWaitDays: String(data.settings.maxWaitDays), weeklyTasks: String(data.settings.weeklyTasks) }); }, [data.settings]);
  const err = (k: keyof Settings) => { const v = form[k].trim(); const n = Number(v); const r = RULES[k]; if (!v) return 'שדה חובה'; if (!Number.isInteger(n)) return 'מספר שלם בלבד'; if (n < r.min || n > r.max) return `צריך להיות ${r.hint}`; return ''; };
  const keys = Object.keys(RULES) as (keyof Settings)[];
  const invalid = keys.some((k) => err(k));
  const dirty = keys.some((k) => Number(form[k]) !== data.settings[k]);
  const save = async () => {
    if (invalid) return;
    setSaving(true);
    const prev = data.settings;
    try {
      await actions.saveSettings({ maxWaiting: Number(form.maxWaiting), maxWaitDays: Number(form.maxWaitDays), weeklyTasks: Number(form.weeklyTasks) });
      toast({ tone: 'success', text: 'היעדים נשמרו', undo: () => actions.saveSettings(prev) });
    } catch (e) { toast({ tone: 'error', text: `לא נשמר: ${e instanceof Error ? e.message : e}` }); }
    finally { setSaving(false); }
  };
  const g = goals(data);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">יעדים והגדרות</h1>
        <p className="mt-1 text-sm text-ink-2">היעדים משותפים לכל מי שפותח את המשרד ומופיעים בלוח הבקרה.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader icon="target" title="מצב היעדים עכשיו" />
          <ul className="grid gap-4 p-5">
            {g.map((x) => (
              <li key={x.id} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{x.label}</span><span className={`tnum ${x.ok ? 'text-working' : 'text-failed'}`}>{x.fmt}</span></div>
                <ProgressBar value={x.progress} tone={x.ok ? 'working' : 'failed'} label={x.label} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader icon="settings" title="הגדרת יעדים" />
          <form className="grid gap-4 p-5" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            {keys.map((k) => (
              <Field key={k} label={RULES[k].label} htmlFor={`g-${k}`} error={err(k)} hint={RULES[k].hint}>
                <TextInput id={`g-${k}`} inputMode="numeric" value={form[k]} invalid={!!err(k)} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="max-w-40" />
              </Field>
            ))}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" variant="primary" loading={saving} disabled={invalid || !dirty}>שמור יעדים</Button>
              <Button onClick={() => setForm({ maxWaiting: String(DEFAULT_SETTINGS.maxWaiting), maxWaitDays: String(DEFAULT_SETTINGS.maxWaitDays), weeklyTasks: String(DEFAULT_SETTINGS.weeklyTasks) })}>ברירת מחדל</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
