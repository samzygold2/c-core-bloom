import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUBJECTS = [
  'mathematics', 'english', 'chemistry', 'physics', 'biology',
  'economics', 'literature-in-english', 'accounting',
];
const YEARS = Array.from({ length: 16 }, (_, i) => 2024 - i);

interface YearStat {
  total: number;
  active: number;
  subjects: Record<string, { total: number; active: number }>;
}

export function JambQuestionsManager({ overrideAdminId }: { overrideAdminId?: string }) {
  const { user } = useAuth();
  const adminId = overrideAdminId || user?.id;

  const [stats, setStats] = useState<Record<number, YearStat>>({});
  const [loading, setLoading] = useState(true);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<number, Set<string>>>({});
  const [busyYear, setBusyYear] = useState<number | null>(null);

  const loadStats = async () => {
    if (!adminId) return;
    setLoading(true);
    const { data: pq } = await (supabase as any)
      .from('past_questions').select('id, subject, year');
    const { data: vis } = await (supabase as any)
      .from('question_visibility').select('question_id, is_active').eq('admin_id', adminId);
    const activeSet = new Set((vis || []).filter((v: any) => v.is_active).map((v: any) => v.question_id));

    const next: Record<number, YearStat> = {};
    YEARS.forEach(y => { next[y] = { total: 0, active: 0, subjects: {} }; });
    (pq || []).forEach((q: any) => {
      if (!next[q.year]) return;
      const s = next[q.year];
      s.total++;
      if (activeSet.has(q.id)) s.active++;
      const sub = s.subjects[q.subject] || { total: 0, active: 0 };
      sub.total++;
      if (activeSet.has(q.id)) sub.active++;
      s.subjects[q.subject] = sub;
    });
    setStats(next);

    // Preselect subjects that are fully active for the user
    const presel: Record<number, Set<string>> = {};
    YEARS.forEach(y => {
      const set = new Set<string>();
      Object.entries(next[y].subjects).forEach(([sub, v]) => {
        if (v.total > 0 && v.active === v.total) set.add(sub);
      });
      presel[y] = set;
    });
    setSelected(presel);
    setLoading(false);
  };

  useEffect(() => { loadStats(); /* eslint-disable-next-line */ }, [adminId]);

  const toggleYear = async (year: number, value: boolean) => {
    if (!adminId) return;
    setBusyYear(year);
    const { data: qs } = await (supabase as any)
      .from('past_questions').select('id').eq('year', year);
    const rows = (qs || []).map((q: any) => ({
      question_id: q.id, admin_id: adminId, is_active: value,
      activated_at: value ? new Date().toISOString() : null, updated_by: user?.id,
    }));
    if (rows.length) {
      const { error } = await (supabase as any)
        .from('question_visibility').upsert(rows, { onConflict: 'question_id,admin_id' });
      if (error) {
        toast({ title: 'Failed', description: error.message, variant: 'destructive' });
        setBusyYear(null); return;
      }
    }
    toast({ title: `${year} ${value ? 'activated' : 'deactivated'}` });
    setBusyYear(null);
    loadStats();
  };

  const toggleSubject = (year: number, sub: string) => {
    setSelected(prev => {
      const cur = new Set(prev[year] || []);
      if (cur.has(sub)) cur.delete(sub); else cur.add(sub);
      return { ...prev, [year]: cur };
    });
  };

  const validate = async (year: number) => {
    if (!adminId) return;
    setBusyYear(year);
    const sel = selected[year] || new Set();
    const { data: qs } = await (supabase as any)
      .from('past_questions').select('id, subject').eq('year', year);
    const rows = (qs || []).map((q: any) => ({
      question_id: q.id, admin_id: adminId, is_active: sel.has(q.subject),
      activated_at: sel.has(q.subject) ? new Date().toISOString() : null,
      updated_by: user?.id,
    }));
    if (rows.length) {
      const { error } = await (supabase as any)
        .from('question_visibility').upsert(rows, { onConflict: 'question_id,admin_id' });
      if (error) {
        toast({ title: 'Validation failed', description: error.message, variant: 'destructive' });
        setBusyYear(null); return;
      }
    }
    toast({ title: `Validated ${sel.size} subject(s) for ${year}` });
    setBusyYear(null);
    loadStats();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-3">
      {YEARS.map(year => {
        const s = stats[year];
        const isOpen = openYear === year;
        const yearActive = s.total > 0 && s.active === s.total;
        const availableSubjects = Object.keys(s.subjects).sort();
        const sel = selected[year] || new Set<string>();

        return (
          <Card key={year} className="overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-lg font-semibold">{year}</div>
                <div className="text-xs text-muted-foreground">
                  {s.total} questions · {availableSubjects.length} subjects
                  {s.total > 0 && <> · <Badge variant="secondary" className="ml-1">{s.active}/{s.total} active</Badge></>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {busyYear === year && <Loader2 className="h-4 w-4 animate-spin" />}
                <Switch
                  checked={yearActive}
                  disabled={s.total === 0 || busyYear === year}
                  onCheckedChange={(v) => toggleYear(year, v)}
                />
              </div>
            </div>

            <div
              className={cn(
                'grid transition-all duration-300 ease-in-out',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div className="overflow-hidden">
                <div className="px-4 pb-4 space-y-3 border-t pt-4">
                  {availableSubjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No questions synced for this year.</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Select subjects to make available:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {availableSubjects.map(sub => {
                          const info = s.subjects[sub];
                          const checked = sel.has(sub);
                          return (
                            <label
                              key={sub}
                              className={cn(
                                'flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors',
                                checked ? 'bg-primary/10 border-primary' : 'hover:bg-muted'
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleSubject(year, sub)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm capitalize truncate">{sub.replace(/-/g, ' ')}</div>
                                <div className="text-xs text-muted-foreground">{info.active}/{info.total} active</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={() => validate(year)}
                          disabled={busyYear === year}
                        >
                          Validate
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpenYear(isOpen ? null : year)}
              className="w-full flex items-center justify-center py-2 border-t hover:bg-muted/50 transition-colors"
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              <ChevronUp
                className={cn(
                  'h-4 w-4 transition-transform duration-300',
                  isOpen ? 'rotate-0' : 'rotate-180'
                )}
              />
            </button>
          </Card>
        );
      })}
    </div>
  );
}
