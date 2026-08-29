import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, Play, RefreshCw, Activity, ShieldCheck, Database, Zap, SlidersHorizontal } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SuperAdminJambManager } from './SuperAdminJambManager';
import { SuperAdminJambMonitor } from './SuperAdminJambMonitor';

const ALL_SUBJECTS = ['mathematics','english','chemistry','physics','biology','economics','literature-in-english','accounting','government','commerce','geography','crk','irk','civic-education','history'];
const CURRENT_YEAR = new Date().getFullYear();
const ALL_YEARS = Array.from({ length: CURRENT_YEAR - 2009 + 1 }, (_, i) => 2009 + i);



type Job = {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  subjects: string[];
  years: number[];
  pages: number;
  current_subject: string | null;
  current_year: number | null;
  current_page: number;
  inserted: number;
  failed: number;
  errors: string[];
  message: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

export function SuperAdminJambSync() {
  const [busy, setBusy] = useState(false);
  const [activating, setActivating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [apiTest, setApiTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selYears, setSelYears] = useState<number[]>([CURRENT_YEAR - 1, CURRENT_YEAR]);
  const [selSubjects, setSelSubjects] = useState<string[]>(['mathematics', 'english']);
  const [advPages, setAdvPages] = useState(5);
  const [job, setJob] = useState<Job | null>(null);
  const pollRef = useRef<number | null>(null);




  const loadLatest = async () => {
    const { data } = await supabase
      .from('jamb_sync_jobs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setJob(data as unknown as Job);
  };

  useEffect(() => { loadLatest(); }, []);

  // Poll while running so users see live progress.
  useEffect(() => {
    if (job?.status === 'running') {
      pollRef.current = window.setInterval(loadLatest, 3000);
      return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    }
  }, [job?.status]);

  const invoke = async (body: Record<string, unknown>, label: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('aloc-sync', { body });
    setBusy(false);
    if (error) { toast({ title: `${label} failed`, description: error.message, variant: 'destructive' }); return; }
    toast({ title: label, description: data?.message ?? 'OK' });
    loadLatest();
  };

  // Quick Sync: fills in every subject/year combination that has no (or too few) questions.
  const quickSync = () =>
    invoke({ action: 'start', mode: 'missing', total: 40, pages: 3, min_per_pair: 40 }, 'Quick Sync started');

  const startAdvancedSync = async () => {
    if (!selYears.length || !selSubjects.length) {
      toast({ title: 'Select at least one year and one subject', variant: 'destructive' });
      return;
    }
    setAdvancedOpen(false);
    await invoke(
      { action: 'start', subjects: selSubjects, years: selYears, total: 40, pages: advPages },
      'Advanced Sync started',
    );
  };

  const testApi = async () => {
    setTesting(true);
    setApiTest(null);
    const { data, error } = await supabase.functions.invoke('aloc-sync', { body: { action: 'test' } });
    setTesting(false);
    if (error) {
      setApiTest({ ok: false, message: `API test failed: ${error.message}` });
      toast({ title: 'ALOC API test failed', description: error.message, variant: 'destructive' });
      return;
    }
    const ok = !!data?.success;
    setApiTest({ ok, message: data?.message ?? (ok ? 'ALOC API is working.' : 'ALOC API is not responding correctly.') });
    toast({ title: ok ? 'ALOC API is working' : 'ALOC API problem', description: data?.message ?? '' , variant: ok ? undefined : 'destructive' });
  };

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);


  const activateAllQuestions = async () => {
    setActivating(true);
    try {
      // 1. Try fast RPC
      const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
        target_admin_id: null,
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
          title: '🌟 Questions Approved & Activated!',
          description: resp.message || `Successfully activated ${resp.questions_approved} past questions across ${resp.admins_affected} admin(s).`,
        });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
        return;
      }

      // 2. Fallback
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

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'super_admin']);
      const adminIds = Array.from(new Set((roles || []).map((r) => r.user_id)));

      const { data: { user } } = await supabase.auth.getUser();

      if (pqs.length && adminIds.length) {
        const rows = [];
        for (const q of pqs) {
          for (const aId of adminIds) {
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
      }

      toast({
        title: 'Questions Activated!',
        description: `Successfully activated all ${pqs.length} past questions for all admins.`,
      });
      window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Activation failed';
      toast({ title: 'Activation failed', description: errMsg, variant: 'destructive' });
    } finally {
      setActivating(false);
    }
  };


  const totalSteps = job ? job.subjects.length * job.years.length * job.pages : 0;
  const doneSteps = job
    ? Math.max(0, job.subjects.indexOf(job.current_subject ?? '') * job.years.length * job.pages
      + job.years.indexOf(job.current_year ?? 0) * job.pages
      + job.current_page)
    : 0;
  const pct = totalSteps ? Math.min(100, Math.round((doneSteps / totalSteps) * 100)) : 0;
  // A job is "live" only if it's running AND has progressed in the last 30s.
  const lastUpdateAgeMs = job ? Date.now() - new Date(job.updated_at ?? job.started_at).getTime() : Infinity;
  const isRunning = job?.status === 'running' && lastUpdateAgeMs < 30_000;
  const canResume = !!job && (job.status === 'failed' || job.status === 'paused' || (job.status === 'running' && lastUpdateAgeMs >= 30_000));



  return (
    <div className="space-y-6">
      <Tabs defaultValue="monitor" className="w-full">
        <TabsList className="grid grid-cols-2 bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="monitor" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            ALOC Integrity & Recursion Guard
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-600" />
            ALOC Sync Controls & Question Manager
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor" className="mt-4">
          <SuperAdminJambMonitor />
        </TabsContent>

        <TabsContent value="sync" className="mt-4 space-y-6">
          <Card className="bg-white border-blue-100">
            <CardHeader><CardTitle className="text-slate-800">JAMB ALOC Sync</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                <strong>Quick Sync</strong> automatically fills in every subject/year combination (2009–{CURRENT_YEAR}) that is missing questions. <strong>Advanced Sync</strong> lets you pick exact years and subjects. <strong>Resume last</strong> continues an interrupted run from where it stopped.
              </p>


              <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Raw API Ingestion Mode Active:</strong> Database deduplication has been disabled. Every question received from the API across all pages and batches is inserted directly and made immediately available to all admins and students.
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={quickSync} disabled={busy || isRunning} className="bg-blue-600 hover:bg-blue-700">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  Quick Sync (missing questions)
                </Button>
                <Button onClick={() => setAdvancedOpen(true)} disabled={busy || isRunning} variant="outline">
                  <SlidersHorizontal className="h-4 w-4 mr-2" /> Advanced Sync
                </Button>
                <Button onClick={() => invoke({ action: 'resume' }, 'Sync resumed')} disabled={busy || isRunning || !canResume} variant="outline">
                  <Play className="h-4 w-4 mr-2" /> Resume last
                </Button>
                <Button onClick={testApi} disabled={testing} variant="outline">
                  {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
                  Test ALOC API
                </Button>
                <Button onClick={activateAllQuestions} disabled={activating} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {activating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Activate All Synced Questions
                </Button>
                <Button onClick={loadLatest} variant="ghost" disabled={busy}>Refresh status</Button>
              </div>

              {apiTest && (
                <div className={`text-xs rounded-lg border p-2.5 ${apiTest.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                  {apiTest.message}
                </div>
              )}


              {job && (
                <div className="space-y-2 rounded border p-3 bg-slate-50">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">Status: {job.status}</span>
                    <span className="text-slate-500">{doneSteps}/{totalSteps} steps</span>
                  </div>
                  <Progress value={pct} />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div>Inserted: <b>{job.inserted}</b></div>
                    <div>Failed: <b>{job.failed}</b></div>
                    <div>Current: <b>{job.current_subject ?? '—'} / {job.current_year ?? '—'}</b></div>
                    <div>Page: <b>{job.current_page}</b></div>
                  </div>
                  {job.message && <p className="text-xs text-slate-500">{job.message}</p>}
                  {job.errors?.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-slate-600">Recent errors ({job.errors.length})</summary>
                      <pre className="mt-1 max-h-40 overflow-auto bg-white p-2 rounded border">{job.errors.slice(-20).join('\n')}</pre>
                    </details>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <SuperAdminJambManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}


