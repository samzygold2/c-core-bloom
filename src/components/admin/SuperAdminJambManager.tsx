import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Check, ChevronRight, Loader2, Pencil, Save, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const YEARS = Array.from({ length: 16 }, (_, i) => 2024 - i);

interface AdminRow {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
}

interface YearStat {
  total: number;
  active: number;
  subjects: Record<string, { total: number; active: number }>;
}

interface PastQuestion {
  id: string;
  subject: string;
  year: number;
  question_text: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string | null;
  explanation: string | null;
}

type View =
  | { kind: 'years' }
  | { kind: 'subjects'; year: number }
  | { kind: 'questions'; year: number; subject: string };

export function SuperAdminJambManager() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminRow | null>(null);

  const [stats, setStats] = useState<Record<number, YearStat>>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [busyYear, setBusyYear] = useState<number | null>(null);

  const [view, setView] = useState<View>({ kind: 'years' });
  const [questions, setQuestions] = useState<PastQuestion[]>([]);
  const [loadingQs, setLoadingQs] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PastQuestion>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // ---- load admins ----
  const loadAdmins = async () => {
    setLoadingAdmins(true);
    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    const ids = (roleRows || []).map((r: any) => r.user_id);
    if (!ids.length) {
      setAdmins([]);
      setLoadingAdmins(false);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, firstname, lastname, email')
      .in('id', ids);
    setAdmins((data as AdminRow[]) || []);
    setLoadingAdmins(false);
  };
  useEffect(() => {
    loadAdmins();
  }, []);

  // ---- load stats for selected admin ----
  const loadStats = async (adminId: string) => {
    setLoadingStats(true);
    const { data: pq } = await (supabase as any)
      .from('past_questions')
      .select('id, subject, year');
    const { data: vis } = await (supabase as any)
      .from('question_visibility')
      .select('question_id, is_active')
      .eq('admin_id', adminId);
    const activeSet = new Set(
      (vis || []).filter((v: any) => v.is_active).map((v: any) => v.question_id),
    );

    const next: Record<number, YearStat> = {};
    YEARS.forEach((y) => {
      next[y] = { total: 0, active: 0, subjects: {} };
    });
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
    setLoadingStats(false);
  };

  useEffect(() => {
    if (selectedAdmin) loadStats(selectedAdmin.id);
  }, [selectedAdmin]);

  // ---- approve / disapprove a whole year ----
  const toggleYearApproval = async (year: number, value: boolean) => {
    if (!selectedAdmin) return;
    setBusyYear(year);
    const { data: qs } = await (supabase as any)
      .from('past_questions')
      .select('id')
      .eq('year', year);
    const { data: { user } } = await supabase.auth.getUser();
    const rows = (qs || []).map((q: any) => ({
      question_id: q.id,
      admin_id: selectedAdmin.id,
      is_active: value,
      activated_at: value ? new Date().toISOString() : null,
      updated_by: user?.id,
    }));
    if (rows.length) {
      const { error } = await (supabase as any)
        .from('question_visibility')
        .upsert(rows, { onConflict: 'question_id,admin_id' });
      if (error) {
        toast({ title: 'Failed', description: error.message, variant: 'destructive' });
        setBusyYear(null);
        return;
      }
    }
    toast({ title: `${year} ${value ? 'approved' : 'disapproved'} for admin` });
    setBusyYear(null);
    loadStats(selectedAdmin.id);
  };

  // ---- load questions for subject/year ----
  const loadQuestions = async (year: number, subject: string) => {
    setLoadingQs(true);
    const { data } = await (supabase as any)
      .from('past_questions')
      .select('*')
      .eq('year', year)
      .eq('subject', subject)
      .order('created_at', { ascending: true });
    setQuestions((data as PastQuestion[]) || []);
    setLoadingQs(false);
  };

  useEffect(() => {
    if (view.kind === 'questions') loadQuestions(view.year, view.subject);
  }, [view]);

  const beginEdit = (q: PastQuestion) => {
    setEditingId(q.id);
    setDraft({ ...q });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    const { error } = await (supabase as any)
      .from('past_questions')
      .update({
        question_text: draft.question_text,
        option_a: draft.option_a,
        option_b: draft.option_b,
        option_c: draft.option_c,
        option_d: draft.option_d,
        correct_answer: draft.correct_answer,
        explanation: draft.explanation,
      })
      .eq('id', id);
    setSavingId(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Question updated' });
    setEditingId(null);
    setDraft({});
    if (view.kind === 'questions') loadQuestions(view.year, view.subject);
  };

  // ---- RENDER ----

  // 1) Admin picker
  if (!selectedAdmin) {
    return (
      <Card className="p-6 bg-white border-blue-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Admins</h3>
            <p className="text-sm text-slate-500">
              Click <b>Allow</b> on an admin to manage their JAMB question visibility.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadAdmins} disabled={loadingAdmins}>
            {loadingAdmins ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>

        {loadingAdmins ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : admins.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No admins found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {admins.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 p-4 border border-blue-100 rounded-lg bg-white hover:border-blue-300 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-800 truncate">
                    {a.firstname} {a.lastname}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{a.email}</div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setSelectedAdmin(a)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <UserCheck className="h-4 w-4 mr-1" /> Allow
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // 2) Questions edit view
  if (view.kind === 'questions') {
    return (
      <Card className="p-6 bg-white border-blue-100">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView({ kind: 'subjects', year: view.year })}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to subjects
            </Button>
            <div>
              <div className="text-lg font-semibold capitalize text-slate-800">
                {view.subject.replace(/-/g, ' ')} · {view.year}
              </div>
              <div className="text-xs text-slate-500">
                Editing for {selectedAdmin.firstname} {selectedAdmin.lastname}
              </div>
            </div>
          </div>
          <Badge variant="secondary">{questions.length} questions</Badge>
        </div>

        {loadingQs ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : questions.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No questions for this subject.</p>
        ) : (
          <div className="space-y-3">
            {questions.map((q, i) => {
              const isEditing = editingId === q.id;
              return (
                <div key={q.id} className="border border-blue-100 rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="text-xs text-slate-500">Q{i + 1}</div>
                    {!isEditing ? (
                      <Button size="sm" variant="outline" onClick={() => beginEdit(q)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={cancelEdit}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveEdit(q.id)}
                          disabled={savingId === q.id}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {savingId === q.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3 mr-1" />
                          )}
                          Save
                        </Button>
                      </div>
                    )}
                  </div>

                  {!isEditing ? (
                    <>
                      <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap mb-2">
                        {q.question_text}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
                        {(['a', 'b', 'c', 'd'] as const).map((k) => {
                          const val = (q as any)[`option_${k}`];
                          const correct =
                            q.correct_answer &&
                            q.correct_answer.toLowerCase().trim() === k;
                          return (
                            <div
                              key={k}
                              className={cn(
                                'px-2 py-1 rounded border flex gap-2',
                                correct
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-200 text-slate-700',
                              )}
                            >
                              <span className="font-bold uppercase">{k}.</span>
                              <span className="flex-1">{val || <em className="text-slate-400">—</em>}</span>
                              {correct && <Check className="h-4 w-4" />}
                            </div>
                          );
                        })}
                      </div>
                      {q.explanation && (
                        <p className="text-xs text-slate-500 mt-2">
                          <b>Explanation:</b> {q.explanation}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        value={draft.question_text ?? ''}
                        onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
                        rows={3}
                        placeholder="Question text"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(['a', 'b', 'c', 'd'] as const).map((k) => (
                          <div key={k} className="flex gap-2 items-center">
                            <span className="font-bold uppercase text-sm w-5">{k}.</span>
                            <Input
                              value={(draft as any)[`option_${k}`] ?? ''}
                              onChange={(e) =>
                                setDraft({ ...draft, [`option_${k}`]: e.target.value } as any)
                              }
                              placeholder={`Option ${k.toUpperCase()}`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 items-center">
                        <label className="text-sm font-medium">Correct answer:</label>
                        <div className="flex gap-1">
                          {(['a', 'b', 'c', 'd'] as const).map((k) => {
                            const active =
                              (draft.correct_answer ?? '').toLowerCase().trim() === k;
                            return (
                              <Button
                                key={k}
                                type="button"
                                size="sm"
                                variant={active ? 'default' : 'outline'}
                                onClick={() => setDraft({ ...draft, correct_answer: k })}
                                className={cn('uppercase w-9', active && 'bg-emerald-600 hover:bg-emerald-700')}
                              >
                                {k}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <Textarea
                        value={draft.explanation ?? ''}
                        onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                        rows={2}
                        placeholder="Explanation (optional)"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  // 3) Subjects view
  if (view.kind === 'subjects') {
    const s = stats[view.year];
    const subjects = s ? Object.keys(s.subjects).sort() : [];
    return (
      <Card className="p-6 bg-white border-blue-100">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setView({ kind: 'years' })}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to years
            </Button>
            <div>
              <div className="text-lg font-semibold text-slate-800">Year {view.year}</div>
              <div className="text-xs text-slate-500">Select a subject to view & edit questions</div>
            </div>
          </div>
        </div>

        {subjects.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No subjects synced for this year.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {subjects.map((sub) => {
              const info = s.subjects[sub];
              return (
                <button
                  key={sub}
                  onClick={() => setView({ kind: 'questions', year: view.year, subject: sub })}
                  className="text-left p-4 border border-blue-100 rounded-lg bg-white hover:border-blue-400 hover:bg-blue-50/40 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium capitalize text-slate-800 truncate">
                      {sub.replace(/-/g, ' ')}
                    </div>
                    <div className="text-xs text-slate-500">
                      {info.total} questions · {info.active}/{info.total} active
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  // 4) Years view (default)
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-white border-blue-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm text-slate-500">Managing visibility for</div>
          <div className="text-lg font-semibold text-slate-800">
            {selectedAdmin.firstname} {selectedAdmin.lastname}{' '}
            <span className="text-sm font-normal text-slate-500">— {selectedAdmin.email}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSelectedAdmin(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Change admin
        </Button>
      </Card>

      <Card className="p-6 bg-white border-blue-100">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-800">JAMB Questions</h3>
          <p className="text-sm text-slate-500">
            Approve a year to make all its questions available to this admin. Click a year to drill into
            subjects and questions.
          </p>
        </div>

        {loadingStats ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {YEARS.map((year) => {
              const st = stats[year] || { total: 0, active: 0, subjects: {} };
              const approved = st.total > 0 && st.active === st.total;
              const partial = st.active > 0 && st.active < st.total;
              return (
                <div
                  key={year}
                  className="border border-blue-100 rounded-lg bg-white overflow-hidden"
                >
                  <button
                    onClick={() => st.total > 0 && setView({ kind: 'subjects', year })}
                    disabled={st.total === 0}
                    className={cn(
                      'w-full text-left p-4 flex items-center justify-between gap-2 transition-colors',
                      st.total > 0 ? 'hover:bg-blue-50/40 cursor-pointer' : 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <div>
                      <div className="text-lg font-semibold text-slate-800">{year}</div>
                      <div className="text-xs text-slate-500">
                        {st.total} questions
                        {partial && (
                          <Badge variant="secondary" className="ml-2">
                            {st.active}/{st.total}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                  <div className="border-t p-2 flex justify-end">
                    {busyYear === year ? (
                      <Button size="sm" disabled variant="outline">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Working
                      </Button>
                    ) : approved ? (
                      <Button
                        size="sm"
                        onClick={() => toggleYearApproval(year, false)}
                        variant="outline"
                        className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                      >
                        <Check className="h-3 w-3 mr-1" /> Approved
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => toggleYearApproval(year, true)}
                        disabled={st.total === 0}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
