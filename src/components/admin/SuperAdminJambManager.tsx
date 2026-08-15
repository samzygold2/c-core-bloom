import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pencil,
  Save,
  UserCheck,
  X,
  Send,
  Sparkles,
  ShieldCheck,
  Users,
  Database,
  Radio,
  Clock,
  Layers,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

const YEARS = Array.from({ length: 16 }, (_, i) => 2024 - i);

interface AdminRow {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  activeCount?: number;
  totalQuestionsCount?: number;
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

interface ApprovalResponse {
  success: boolean;
  message: string;
  questions_approved: number;
  admins_affected: number;
  visibility_records_updated: number;
  admin_details?: Array<{
    id: string;
    name: string;
    email: string;
    active_questions: number;
  }>;
  approved_at?: string;
  duration_ms?: number;
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
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [actionProgress, setActionProgress] = useState<{ step: string; pct: number } | null>(null);

  const [lastApprovalResponse, setLastApprovalResponse] = useState<ApprovalResponse | null>(null);

  const [view, setView] = useState<View>({ kind: 'years' });
  const [questions, setQuestions] = useState<PastQuestion[]>([]);
  const [loadingQs, setLoadingQs] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PastQuestion>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const [totalDatabaseQuestions, setTotalDatabaseQuestions] = useState<number>(0);

  // ---- load admins and their overall active question coverage ----
  const loadAdmins = useCallback(async () => {
    setLoadingAdmins(true);
    try {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'super_admin']);
      const ids = Array.from(new Set((roleRows || []).map((r) => r.user_id)));
      
      const { count: pqCount } = await supabase
        .from('past_questions')
        .select('*', { count: 'exact', head: true });
      const totalPq = pqCount || 0;
      setTotalDatabaseQuestions(totalPq);

      if (!ids.length) {
        setAdmins([]);
        setLoadingAdmins(false);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, firstname, lastname, email')
        .in('id', ids);

      // Fetch active visibility counts for each admin
      const adminList: AdminRow[] = [];
      for (const p of profiles || []) {
        const { count: activeCount } = await supabase
          .from('question_visibility')
          .select('*', { count: 'exact', head: true })
          .eq('admin_id', p.id)
          .eq('is_active', true);
        
        adminList.push({
          id: p.id,
          firstname: p.firstname || '',
          lastname: p.lastname || '',
          email: p.email || '',
          activeCount: activeCount || 0,
          totalQuestionsCount: totalPq,
        });
      }

      setAdmins(adminList);
      if (selectedAdmin) {
        const updated = adminList.find(a => a.id === selectedAdmin.id);
        if (updated) setSelectedAdmin(updated);
      }
    } catch (err) {
      console.error('Error loading admins:', err);
    } finally {
      setLoadingAdmins(false);
    }
  }, [selectedAdmin]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  // Listen for global approval events & Supabase Realtime live changes
  useEffect(() => {
    const handleApprovedEvent = () => {
      loadAdmins();
      if (selectedAdmin) {
        loadStats(selectedAdmin.id);
      }
    };
    window.addEventListener('jamb-questions-approved', handleApprovedEvent);

    // Subscribe to realtime database changes for questions, visibility & sync jobs
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadAdmins();
        if (selectedAdmin) {
          loadStats(selectedAdmin.id);
        }
      }, 500);
    };

    const channel = supabase
      .channel('jamb_manager_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'past_questions' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_visibility' }, triggerDebouncedReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamb_sync_jobs' }, triggerDebouncedReload)
      .subscribe();

    return () => {
      window.removeEventListener('jamb-questions-approved', handleApprovedEvent);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [selectedAdmin, loadAdmins]);

  // ---- load stats for selected admin ----
  const loadStats = async (adminId: string) => {
    setLoadingStats(true);
    try {
      // Fetch all past questions with pagination
      let pq: Array<{ id: string; subject: string; year: number }> = [];
      let fromPq = 0;
      const batchSize = 5000;
      while (true) {
        const { data, error } = await supabase
          .from('past_questions')
          .select('id, subject, year')
          .range(fromPq, fromPq + batchSize - 1);
        if (error || !data || data.length === 0) break;
        pq = [...pq, ...data];
        if (data.length < batchSize) break;
        fromPq += batchSize;
      }

      // Fetch all question visibility rows for this admin
      let vis: Array<{ question_id: string; is_active: boolean }> = [];
      let fromVis = 0;
      while (true) {
        const { data, error } = await supabase
          .from('question_visibility')
          .select('question_id, is_active')
          .eq('admin_id', adminId)
          .range(fromVis, fromVis + batchSize - 1);
        if (error || !data || data.length === 0) break;
        vis = [...vis, ...data];
        if (data.length < batchSize) break;
        fromVis += batchSize;
      }

      const activeSet = new Set(
        (vis || []).filter((v) => v.is_active).map((v) => v.question_id),
      );

      const next: Record<number, YearStat> = {};
      YEARS.forEach((y) => {
        next[y] = { total: 0, active: 0, subjects: {} };
      });
      (pq || []).forEach((q) => {
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
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (selectedAdmin) loadStats(selectedAdmin.id);
  }, [selectedAdmin]);

  // ---- approve / disapprove a whole year ----
  const toggleYearApproval = async (year: number, value: boolean) => {
    if (!selectedAdmin) return;
    setBusyYear(year);
    try {
      if (value) {
        // Use fast RPC for approving year
        const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
          target_admin_id: selectedAdmin.id,
          specific_year: year,
          specific_subject: null,
        });

        if (!error && data) {
          const resp = data as unknown as ApprovalResponse;
          setLastApprovalResponse(resp);
          toast({
            title: `Year ${year} Questions Approved!`,
            description: `Successfully approved all questions for year ${year} to ${selectedAdmin.firstname}.`,
          });
          window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
          setBusyYear(null);
          loadStats(selectedAdmin.id);
          loadAdmins();
          return;
        }
      }

      // Fallback or deactivation
      const { data: qs } = await supabase
        .from('past_questions')
        .select('id')
        .eq('year', year);
      const { data: { user } } = await supabase.auth.getUser();
      const rows = (qs || []).map((q) => ({
        question_id: q.id,
        admin_id: selectedAdmin.id,
        is_active: value,
        activated_at: value ? new Date().toISOString() : null,
        updated_by: user?.id,
      }));
      if (rows.length) {
        for (let i = 0; i < rows.length; i += 5000) {
          const chunk = rows.slice(i, i + 5000);
          const { error } = await supabase
            .from('question_visibility')
            .upsert(chunk, { onConflict: 'question_id,admin_id' });
          if (error) {
            toast({ title: 'Failed', description: error.message, variant: 'destructive' });
            setBusyYear(null);
            return;
          }
        }
      }
      toast({ title: `${year} ${value ? 'approved' : 'disapproved'} for admin` });
      window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
      setBusyYear(null);
      loadStats(selectedAdmin.id);
      loadAdmins();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Operation failed', description: errMsg, variant: 'destructive' });
      setBusyYear(null);
    }
  };

  // ---- approve a specific subject ----
  const approveSubjectQuestions = async (year: number, subject: string) => {
    if (!selectedAdmin) return;
    setBusyAction(true);
    setActionProgress({ step: `Approving ${subject} (${year})...`, pct: 30 });
    try {
      // 1. Try high-performance RPC
      const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
        target_admin_id: selectedAdmin.id,
        specific_year: year,
        specific_subject: subject,
      });

      if (!error && data) {
        const resp = data as unknown as ApprovalResponse;
        setLastApprovalResponse(resp);
        setActionProgress({ step: 'Done!', pct: 100 });
        toast({
          title: 'Subject Approved',
          description: `Approved all questions for ${subject.replace(/-/g, ' ')} (${year}) for ${selectedAdmin.firstname}.`,
        });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
        loadStats(selectedAdmin.id);
        loadAdmins();
        setBusyAction(false);
        setActionProgress(null);
        return;
      }

      // Fallback
      const { data: qs } = await supabase
        .from('past_questions')
        .select('id')
        .eq('year', year)
        .eq('subject', subject);
      const { data: { user } } = await supabase.auth.getUser();

      if (qs && qs.length > 0) {
        const rows = qs.map((q) => ({
          question_id: q.id,
          admin_id: selectedAdmin.id,
          is_active: true,
          activated_at: new Date().toISOString(),
          updated_by: user?.id,
        }));

        for (let i = 0; i < rows.length; i += 5000) {
          const chunk = rows.slice(i, i + 5000);
          const { error: upsertErr } = await supabase
            .from('question_visibility')
            .upsert(chunk, { onConflict: 'question_id,admin_id' });
          if (upsertErr) {
            toast({ title: 'Activation failed', description: upsertErr.message, variant: 'destructive' });
            setBusyAction(false);
            setActionProgress(null);
            return;
          }
        }
        toast({
          title: 'Subject Approved',
          description: `Approved all ${qs.length} questions for ${subject.replace(/-/g, ' ')} (${year}).`,
        });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
        loadStats(selectedAdmin.id);
        loadAdmins();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Activation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setBusyAction(false);
      setActionProgress(null);
    }
  };

  // ---- approve ALL questions system-wide or for selected admin with rich UI response ----
  const approveAllQuestions = async (targetAdminId?: string, adminName?: string) => {
    setBusyAction(true);
    setActionProgress({
      step: targetAdminId
        ? `Preparing all JAMB questions for ${adminName || 'admin'}...`
        : 'Broadcasting approval of ALL JAMB questions across all admins...',
      pct: 25,
    });

    try {
      // 1. Try atomic PostgreSQL RPC for instant execution and exact telemetry
      const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
        target_admin_id: targetAdminId || null,
        specific_year: null,
        specific_subject: null,
      });

      if (!error && data) {
        const resp = data as unknown as ApprovalResponse;
        setActionProgress({ step: 'Updating live interface status...', pct: 90 });
        setLastApprovalResponse(resp);

        toast({
          title: '🌟 Approval Successful & Synchronized!',
          description: resp.message || `Approved ${resp.questions_approved} questions across ${resp.admins_affected} admin(s).`,
        });

        // Trigger real-time broadcast event to update all tabs & components
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));

        await loadAdmins();
        if (selectedAdmin) {
          await loadStats(selectedAdmin.id);
        }

        setActionProgress({ step: 'Complete!', pct: 100 });
        setTimeout(() => setActionProgress(null), 1200);
        return;
      }

      // 2. Client-side fallback if RPC is unavailable
      setActionProgress({ step: 'Loading question catalogue from database...', pct: 40 });
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

      let targetAdminIds: string[] = [];
      if (targetAdminId) {
        targetAdminIds = [targetAdminId];
      } else {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'super_admin']);
        targetAdminIds = Array.from(new Set((roles || []).map((r) => r.user_id)));
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (pqs.length && targetAdminIds.length) {
        setActionProgress({
          step: `Granting visibility for ${pqs.length} questions to ${targetAdminIds.length} admin(s)...`,
          pct: 70,
        });

        const rows = [];
        for (const q of pqs) {
          for (const aId of targetAdminIds) {
            rows.push({
              question_id: q.id,
              admin_id: aId,
              is_active: true,
              activated_at: new Date().toISOString(),
              updated_by: user?.id,
            });
          }
        }

        for (let i = 0; i < rows.length; i += 5000) {
          const chunk = rows.slice(i, i + 5000);
          const { error: upsertErr } = await supabase
            .from('question_visibility')
            .upsert(chunk, { onConflict: 'question_id,admin_id' });
          if (upsertErr) throw upsertErr;
        }

        setLastApprovalResponse({
          success: true,
          message: `Approved all ${pqs.length} questions for ${targetAdminIds.length} admin(s).`,
          questions_approved: pqs.length,
          admins_affected: targetAdminIds.length,
          visibility_records_updated: rows.length,
          approved_at: new Date().toISOString(),
        });
      }

      toast({
        title: 'All Questions Approved!',
        description: `Successfully made all ${pqs.length} past questions available and active.`,
      });

      window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
      await loadAdmins();
      if (selectedAdmin) await loadStats(selectedAdmin.id);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Activation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setBusyAction(false);
      setTimeout(() => setActionProgress(null), 1000);
    }
  };

  // ---- load questions for subject/year ----
  const loadQuestions = async (year: number, subject: string) => {
    setLoadingQs(true);
    const { data } = await supabase
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
    const { error } = await supabase
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

  // Render Co-Responding UI Response Banner
  const renderApprovalResponseBanner = () => {
    if (!lastApprovalResponse) return null;

    return (
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 border border-emerald-500/40 rounded-xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-base text-emerald-200">
                  JAMB Questions Approval Confirmed & Broadcasted
                </h4>
                <Badge className="bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400">
                  100% Active In UI
                </Badge>
              </div>
              <p className="text-sm text-slate-300 mt-1">
                {lastApprovalResponse.message}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-emerald-500/20 text-xs">
                <div>
                  <span className="text-slate-400 block">Questions Approved</span>
                  <span className="text-sm font-extrabold text-white font-mono">
                    {lastApprovalResponse.questions_approved.toLocaleString()} Qs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Admins Updated</span>
                  <span className="text-sm font-extrabold text-emerald-300 font-mono">
                    {lastApprovalResponse.admins_affected} Admin(s)
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Records Synced</span>
                  <span className="text-sm font-extrabold text-teal-300 font-mono">
                    {lastApprovalResponse.visibility_records_updated.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Execution Speed</span>
                  <span className="text-sm font-extrabold text-amber-300 font-mono">
                    {lastApprovalResponse.duration_ms ? `${lastApprovalResponse.duration_ms}ms` : 'Instant'}
                  </span>
                </div>
              </div>

              {/* Admin status breakdown chips */}
              {lastApprovalResponse.admin_details && lastApprovalResponse.admin_details.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-2">
                  {lastApprovalResponse.admin_details.map((adm) => (
                    <div key={adm.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/10 rounded-md text-xs font-medium border border-white/10">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>{adm.name || adm.email}</span>
                      <span className="text-emerald-300 font-mono">({adm.active_questions} Qs)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLastApprovalResponse(null)}
            className="text-slate-400 hover:text-white hover:bg-white/10 shrink-0 h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  // ---- RENDER ----

  // 1) Admin picker view (default entry)
  if (!selectedAdmin) {
    const totalAdminsCount = admins.length;
    const fullyApprovedAdmins = admins.filter(
      (a) => (a.activeCount || 0) >= (totalDatabaseQuestions || 1) && totalDatabaseQuestions > 0
    ).length;
    const overallCoveragePct =
      totalAdminsCount > 0
        ? Math.round(
            (admins.reduce((acc, a) => acc + (a.activeCount || 0), 0) /
              Math.max(1, totalDatabaseQuestions * totalAdminsCount)) *
              100,
          )
        : 0;

    return (
      <div className="space-y-6">
        {/* Live Approval Response Feedback */}
        {renderApprovalResponseBanner()}

        {/* Global Action Header & Dispatch Control */}
        <Card className="border-blue-200 shadow-sm bg-gradient-to-br from-white to-blue-50/40">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-xl font-bold text-slate-800">
                    JAMB Question Approval & Distribution Control Center
                  </CardTitle>
                </div>
                <CardDescription className="text-sm text-slate-600 mt-1">
                  Super Admin command to approve, activate, and broadcast all 5,000+ JAMB UTME past questions to all admins and their assigned students.
                </CardDescription>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => approveAllQuestions()}
                  disabled={busyAction}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
                >
                  {busyAction ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Approve ALL Questions to ALL Admins
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAdmins}
                  disabled={loadingAdmins}
                  className="border-slate-300"
                >
                  {loadingAdmins ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </div>

            {/* Action Progress Bar (if in flight) */}
            {actionProgress && (
              <div className="mt-4 p-3 bg-blue-100/60 border border-blue-200 rounded-lg space-y-1.5 animate-pulse">
                <div className="flex justify-between text-xs font-semibold text-blue-900">
                  <span className="flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                    {actionProgress.step}
                  </span>
                  <span>{actionProgress.pct}%</span>
                </div>
                <Progress value={actionProgress.pct} className="h-2 bg-blue-200" />
              </div>
            )}

            {/* Overview Metric Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-blue-100">
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>DATABASE QUESTIONS</span>
                  <Database className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-slate-800 mt-1">
                  {totalDatabaseQuestions.toLocaleString()} Qs
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  15 Subjects × 16 Years Available
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>REGISTERED ADMINS</span>
                  <Users className="h-4 w-4 text-purple-600" />
                </div>
                <div className="text-2xl font-bold text-slate-800 mt-1">
                  {totalAdminsCount} Admins
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {fullyApprovedAdmins} of {totalAdminsCount} have 100% approved access
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>OVERALL APPROVAL COVERAGE</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-slate-800">
                    {overallCoveragePct}%
                  </span>
                  <span className="text-xs text-emerald-600 font-semibold">
                    {overallCoveragePct === 100 ? 'Fully Synced' : 'Ready to Approve'}
                  </span>
                </div>
                <Progress value={overallCoveragePct} className="h-1.5 mt-1.5" />
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Admins Grid */}
        <Card className="bg-white border-blue-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-slate-800">
              Admin Question Approval Status & Individual Allocation
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Select an admin below to inspect subject-by-subject and year-by-year allocations, or approve instantly with 1-click.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAdmins ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : admins.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">No admins registered yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {admins.map((a) => {
                  const act = a.activeCount || 0;
                  const totalQ = a.totalQuestionsCount || totalDatabaseQuestions || 1;
                  const pctAdmin = Math.min(100, Math.round((act / Math.max(1, totalQ)) * 100));
                  const isFull = pctAdmin === 100 && totalQ > 0;

                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'border rounded-xl p-4 transition-all duration-200 flex flex-col justify-between gap-3 bg-white',
                        isFull
                          ? 'border-emerald-200 bg-emerald-50/20 hover:border-emerald-400'
                          : 'border-slate-200 hover:border-blue-300',
                      )}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
                              <span>{a.firstname} {a.lastname}</span>
                              {isFull && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                            </div>
                            <div className="text-xs text-slate-500 truncate">{a.email}</div>
                          </div>
                          <Badge
                            variant={isFull ? 'default' : 'secondary'}
                            className={cn(
                              'text-[11px] font-medium shrink-0',
                              isFull
                                ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-700',
                            )}
                          >
                            {isFull ? '100% Approved' : `${pctAdmin}% Active`}
                          </Badge>
                        </div>

                        {/* Progress Bar & Question Count */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-600 font-medium mb-1">
                            <span>Approved Questions:</span>
                            <span className="font-mono font-bold">
                              {act.toLocaleString()} / {totalQ.toLocaleString()}
                            </span>
                          </div>
                          <Progress
                            value={pctAdmin}
                            className={cn('h-1.5', isFull ? 'bg-emerald-100' : 'bg-slate-100')}
                          />
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedAdmin(a)}
                          className="flex-1 text-xs border-slate-300"
                        >
                          <UserCheck className="h-3.5 w-3.5 mr-1" />
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveAllQuestions(a.id, `${a.firstname} ${a.lastname}`)}
                          disabled={busyAction}
                          className={cn(
                            'text-xs font-medium',
                            isFull
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                              : 'bg-blue-600 hover:bg-blue-700 text-white',
                          )}
                        >
                          {isFull ? (
                            <>
                              <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                              Approved
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5 mr-1" />
                              Approve All
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2) Questions edit view (inside a subject & year)
  if (view.kind === 'questions') {
    return (
      <div className="space-y-6">
        {renderApprovalResponseBanner()}

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
                  {view.subject.replace(/-/g, ' ')} · Year {view.year}
                </div>
                <div className="text-xs text-slate-500">
                  Managing for {selectedAdmin.firstname} {selectedAdmin.lastname} ({selectedAdmin.email})
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{questions.length} questions</Badge>
              <Button
                size="sm"
                onClick={() => approveSubjectQuestions(view.year, view.subject)}
                disabled={busyAction || questions.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {busyAction ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Approve All {questions.length} Questions for this Subject
              </Button>
            </div>
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
                      <div className="text-xs text-slate-500 font-bold">Q{i + 1}</div>
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
                            const val = (q as unknown as Record<string, string | null>)[`option_${k}`];
                            const correct =
                              q.correct_answer &&
                              q.correct_answer.toLowerCase().trim() === k;
                            return (
                              <div
                                key={k}
                                className={cn(
                                  'px-2 py-1 rounded border flex gap-2',
                                  correct
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-medium'
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
                                value={(draft as unknown as Record<string, string | null>)[`option_${k}`] ?? ''}
                                onChange={(e) =>
                                  setDraft({ ...draft, [`option_${k}`]: e.target.value } as Partial<PastQuestion>)
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
      </div>
    );
  }

  // 3) Subjects view
  if (view.kind === 'subjects') {
    const s = stats[view.year];
    const subjects = s ? Object.keys(s.subjects).sort() : [];
    const yearActiveCount = s ? s.active : 0;
    const yearTotalCount = s ? s.total : 0;
    const isYearFullyApproved = yearTotalCount > 0 && yearActiveCount === yearTotalCount;

    return (
      <div className="space-y-6">
        {renderApprovalResponseBanner()}

        <Card className="p-6 bg-white border-blue-100">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setView({ kind: 'years' })}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to years
              </Button>
              <div>
                <div className="text-lg font-semibold text-slate-800">
                  Year {view.year} Subjects & Approvals
                </div>
                <div className="text-xs text-slate-500">
                  Managing for {selectedAdmin.firstname} {selectedAdmin.lastname} · {yearActiveCount}/{yearTotalCount} questions active
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => toggleYearApproval(view.year, true)}
                disabled={busyYear === view.year || subjects.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {busyYear === view.year ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                )}
                Approve ALL Subjects for {view.year}
              </Button>
            </div>
          </div>

          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No subjects synced for this year.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {subjects.map((sub) => {
                const info = s.subjects[sub];
                const isFullyActive = info.total > 0 && info.active === info.total;
                return (
                  <div
                    key={sub}
                    className={cn(
                      'p-4 border rounded-lg transition-colors flex items-center justify-between gap-2 bg-white',
                      isFullyActive ? 'border-emerald-200 bg-emerald-50/20' : 'border-blue-100 hover:border-blue-300',
                    )}
                  >
                    <button
                      onClick={() => setView({ kind: 'questions', year: view.year, subject: sub })}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="font-medium capitalize text-slate-800 truncate flex items-center gap-1">
                        <span>{sub.replace(/-/g, ' ')}</span>
                        {isFullyActive && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                      </div>
                      <div className="text-xs text-slate-500">
                        {info.total} questions ·{' '}
                        <span
                          className={
                            info.active < info.total
                              ? 'text-amber-600 font-semibold'
                              : 'text-emerald-600 font-semibold'
                          }
                        >
                          {info.active}/{info.total} active
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={isFullyActive ? 'outline' : 'default'}
                        onClick={() => approveSubjectQuestions(view.year, sub)}
                        disabled={busyAction}
                        className={
                          isFullyActive
                            ? 'text-emerald-700 border-emerald-300 bg-emerald-50'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }
                      >
                        {isFullyActive ? <Check className="h-3 w-3 mr-1" /> : 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setView({ kind: 'questions', year: view.year, subject: sub })}
                      >
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      </Button>
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

  // 4) Years overview view for selected admin
  const totalSelectedActive = Object.values(stats).reduce((acc, y) => acc + y.active, 0);
  const totalSelectedQs = Object.values(stats).reduce((acc, y) => acc + y.total, 0);
  const isSelectedAdminFull = totalSelectedQs > 0 && totalSelectedActive === totalSelectedQs;

  return (
    <div className="space-y-4">
      {renderApprovalResponseBanner()}

      {/* Admin Context Banner with 1-Click Approve Action */}
      <Card className="p-5 bg-gradient-to-r from-white to-blue-50/50 border-blue-200 shadow-sm flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            Managing Question Approvals For
          </div>
          <div className="text-xl font-bold text-slate-800 flex items-center gap-2 mt-0.5">
            <span>{selectedAdmin.firstname} {selectedAdmin.lastname}</span>
            <span className="text-xs font-normal text-slate-500">({selectedAdmin.email})</span>
            {isSelectedAdminFull && (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                100% Approved
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Status:{' '}
            <strong className="text-slate-700">
              {totalSelectedActive.toLocaleString()} / {totalSelectedQs.toLocaleString()} questions active
            </strong>{' '}
            for this admin
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => approveAllQuestions(selectedAdmin.id, `${selectedAdmin.firstname} ${selectedAdmin.lastname}`)}
            disabled={busyAction}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
          >
            {busyAction ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Approve ALL Questions for {selectedAdmin.firstname}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => approveAllQuestions()}
            disabled={busyAction}
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            <Send className="h-3.5 w-3.5 mr-1" />
            Broadcast to ALL Admins
          </Button>

          <Button variant="outline" size="sm" onClick={() => setSelectedAdmin(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Change admin
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-white border-blue-100">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">JAMB Questions Matrix by Year</h3>
            <p className="text-sm text-slate-500">
              Click a year to view and approve by specific subject, or click "Approve All" to make the entire year available instantly.
            </p>
          </div>
        </div>

        {loadingStats ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {YEARS.map((year) => {
              const st = stats[year] || { total: 0, active: 0, subjects: {} };
              const approved = st.total > 0 && st.active === st.total;
              const partial = st.active > 0 && st.active < st.total;
              return (
                <div
                  key={year}
                  className={cn(
                    'border rounded-lg bg-white overflow-hidden transition-all duration-150',
                    approved ? 'border-emerald-200 bg-emerald-50/10' : 'border-blue-100',
                  )}
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
                      <div className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{year}</span>
                        {approved && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {st.total} questions
                        {partial && (
                          <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 text-[10px]">
                            {st.active}/{st.total} active
                          </Badge>
                        )}
                        {approved && (
                          <Badge variant="secondary" className="ml-2 bg-emerald-100 text-emerald-800 text-[10px]">
                            All {st.total} active
                          </Badge>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                  <div className="border-t p-2 flex justify-end bg-slate-50/50">
                    {busyYear === year ? (
                      <Button size="sm" disabled variant="outline" className="text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Working
                      </Button>
                    ) : approved ? (
                      <Button
                        size="sm"
                        onClick={() => toggleYearApproval(year, false)}
                        variant="outline"
                        className="text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                      >
                        <Check className="h-3 w-3 mr-1" /> Approved
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => toggleYearApproval(year, true)}
                        disabled={st.total === 0}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Approve All ({st.total})
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
