import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { CheckCircle2, ChevronUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface YearStat {
  total: number;
  active: number;
  subjects: Record<string, { total: number; active: number }>;
}

const PAGE = 1000;

// Fetch every question id for a year, page by page (the API caps rows per request).
async function fetchYearQuestions(year: number) {
  const rows: Array<{ id: string; subject: string }> = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('past_questions')
      .select('id, subject')
      .eq('year', year)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export function JambQuestionsManager({ overrideAdminId }: { overrideAdminId?: string }) {
  const { user } = useAuth();
  const adminId = overrideAdminId || user?.id;

  const [stats, setStats] = useState<Record<number, YearStat>>({});
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [openYear, setOpenYear] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<number, Set<string>>>({});
  const [busyYear, setBusyYear] = useState<number | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const loadStats = useCallback(async () => {
    if (!adminId) return;
    setLoading(true);

    const { data, error } = await supabase.rpc('jamb_admin_question_stats', {
      _admin_id: adminId,
    });

    if (error) {
      toast({ title: 'Could not load question counts', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const rows = (data || []) as Array<{ subject: string; year: number; total: number; active: number }>;
    const next: Record<number, YearStat> = {};
    rows.forEach((r) => {
      const y = Number(r.year);
      if (!next[y]) next[y] = { total: 0, active: 0, subjects: {} };
      const total = Number(r.total);
      const active = Number(r.active);
      next[y].total += total;
      next[y].active += active;
      next[y].subjects[r.subject] = { total, active };
    });

    const yearList = Object.keys(next).map(Number).sort((a, b) => b - a);
    setStats(next);
    setYears(yearList);

    // Preselect subjects that have any active questions
    const presel: Record<number, Set<string>> = {};
    yearList.forEach(y => {
      const set = new Set<string>();
      Object.entries(next[y].subjects).forEach(([sub, v]) => {
        if (v.total > 0 && v.active > 0) set.add(sub);
      });
      presel[y] = set;
    });
    setSelected(presel);
    setLoading(false);
  }, [adminId]);

  useEffect(() => {
    loadStats();
    const handleApproved = () => {
      loadStats();
    };
    window.addEventListener('jamb-questions-approved', handleApproved);
    return () => window.removeEventListener('jamb-questions-approved', handleApproved);
  }, [loadStats]);

  const toggleYear = async (year: number, value: boolean) => {
    if (!adminId) return;
    setBusyYear(year);
    if (value) {
      const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
        target_admin_id: adminId,
        specific_year: year,
        specific_subject: null,
      });
      if (!error && data) {
        toast({ title: `Year ${year} questions activated` });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
        setBusyYear(null);
        loadStats();
        return;
      }
    }

    const qs = await fetchYearQuestions(year);
    const rows = qs.map((q) => ({
      question_id: q.id, admin_id: adminId, is_active: value,
      activated_at: value ? new Date().toISOString() : null, updated_by: user?.id,
    }));
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from('question_visibility').upsert(chunk, { onConflict: 'question_id,admin_id' });
        if (error) {
          toast({ title: 'Failed', description: error.message, variant: 'destructive' });
          setBusyYear(null); return;
        }
      }
    }
    toast({ title: `${year} ${value ? 'activated' : 'deactivated'}` });
    window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
    setBusyYear(null);
    loadStats();
  };

  const activateAllOverall = async () => {
    if (!adminId) return;
    setBusyAll(true);
    try {
      const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
        target_admin_id: adminId,
        specific_year: null,
        specific_subject: null,
      });

      if (!error && data) {
        const resp = data as unknown as {
          questions_approved: number;
          admins_affected: number;
          message?: string;
        };
        toast({
          title: '🌟 All Questions Activated!',
          description: resp.message || `Activated all ${resp.questions_approved} questions for your school.`,
        });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
        loadStats();
        return;
      }

      let pqs: { id: string }[] = [];
      let fromPq = 0;
      const batchSize = 5000;
      while (true) {
        const { data: pqData, error: pqErr } = await supabase
          .from('past_questions')
          .select('id')
          .range(fromPq, fromPq + batchSize - 1);
        if (pqErr || !pqData || pqData.length === 0) break;
        pqs = [...pqs, ...pqData];
        if (pqData.length < batchSize) break;
        fromPq += batchSize;
      }

      if (pqs.length) {
        const rows = pqs.map((q) => ({
          question_id: q.id,
          admin_id: adminId,
          is_active: true,
          activated_at: new Date().toISOString(),
          updated_by: user?.id,
        }));

        for (let i = 0; i < rows.length; i += 5000) {
          const chunk = rows.slice(i, i + 5000);
          const { error: upsertErr } = await supabase
            .from('question_visibility')
            .upsert(chunk, { onConflict: 'question_id,admin_id' });
          if (upsertErr) throw upsertErr;
        }
      }

      toast({
        title: 'All Questions Activated!',
        description: `Activated all ${pqs.length} questions for your school.`,
      });
      window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
      loadStats();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Activation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setBusyAll(false);
    }
  };

  const toggleSubject = (year: number, sub: string) => {
    setSelected(prev => {
      const cur = new Set(prev[year] || []);
      if (cur.has(sub)) cur.delete(sub); else cur.add(sub);
      return { ...prev, [year]: cur };
    });
  };

  const selectAllSubjectsInYear = (year: number) => {
    const s = stats[year];
    if (!s) return;
    const subs = Object.keys(s.subjects);
    setSelected(prev => ({
      ...prev,
      [year]: new Set(subs),
    }));
  };

  const validate = async (year: number) => {
    if (!adminId) return;
    setBusyYear(year);
    const sel = selected[year] || new Set();
    const qs = await fetchYearQuestions(year);
    const rows = qs.map((q) => ({
      question_id: q.id, admin_id: adminId, is_active: sel.has(q.subject),
      activated_at: sel.has(q.subject) ? new Date().toISOString() : null,
      updated_by: user?.id,
    }));
    if (rows.length) {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase
          .from('question_visibility').upsert(chunk, { onConflict: 'question_id,admin_id' });
        if (error) {
          toast({ title: 'Validation failed', description: error.message, variant: 'destructive' });
          setBusyYear(null); return;
        }
      }
    }
    toast({ title: `Validated ${sel.size} subject(s) for ${year}` });
    window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
    setBusyYear(null);
    loadStats();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-2 bg-slate-50 border rounded-lg flex-wrap gap-2">
        <span className="text-sm text-slate-600 font-medium">Bulk Question Activation</span>
        <Button
          onClick={activateAllOverall}
          disabled={busyAll}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {busyAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Activate All Synced Questions Across All Years
        </Button>
      </div>

      <div className="space-y-2">
        {YEARS.map(year => {
          const s = stats[year] || { total: 0, active: 0, subjects: {} };
          const isOpen = openYear === year;
          const isYearActive = s.total > 0 && s.active === s.total;

          return (
            <Card key={year} className="p-4 bg-white border-blue-100">
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-3 cursor-pointer flex-1"
                  onClick={() => setOpenYear(isOpen ? null : year)}
                >
                  <span className="font-semibold text-slate-800 text-base">{year}</span>
                  <Badge variant="secondary" className={s.active > 0 ? 'bg-emerald-100 text-emerald-800' : ''}>
                    {s.active}/{s.total} active
                  </Badge>
                  {s.total === 0 && (
                    <span className="text-xs text-slate-400 italic">Not synced yet</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {busyYear === year ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  ) : (
                    <Switch
                      checked={isYearActive}
                      disabled={s.total === 0}
                      onCheckedChange={(val) => toggleYear(year, val)}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenYear(isOpen ? null : year)}
                  >
                    <ChevronUp className={cn("h-4 w-4 transition-transform", !isOpen && "rotate-180")} />
                  </Button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 pt-4 border-t border-blue-50 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Select subjects to activate for {year}:</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-xs text-blue-600"
                      onClick={() => selectAllSubjectsInYear(year)}
                    >
                      Select all available
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {SUBJECTS.map(sub => {
                      const subStat = s.subjects[sub] || { total: 0, active: 0 };
                      const isChecked = selected[year]?.has(sub) || false;
                      const hasQuestions = subStat.total > 0;

                      return (
                        <label
                          key={sub}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded border text-xs cursor-pointer transition-colors",
                            !hasQuestions && "opacity-40 cursor-not-allowed bg-slate-50",
                            hasQuestions && isChecked && "bg-blue-50 border-blue-300",
                            hasQuestions && !isChecked && "hover:bg-slate-50 border-slate-200"
                          )}
                        >
                          <Checkbox
                            checked={isChecked}
                            disabled={!hasQuestions}
                            onCheckedChange={() => toggleSubject(year, sub)}
                          />
                          <span className="capitalize truncate flex-1">{sub.replace(/-/g, ' ')}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {subStat.active}/{subStat.total}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      size="sm"
                      disabled={busyYear === year}
                      onClick={() => validate(year)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    >
                      {busyYear === year ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : null}
                      Save & Apply ({year})
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
