import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, Play, RefreshCw } from 'lucide-react';
import { JambQuestionsManager } from './JambQuestionsManager';

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
  finished_at: string | null;
};

export function SuperAdminJambSync() {
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [adminId, setAdminId] = useState<string>('');
  const [admins, setAdmins] = useState<{ id: string; firstname: string; lastname: string; email: string }[]>([]);
  const pollRef = useRef<number | null>(null);

  const loadLatest = async () => {
    const { data } = await supabase
      .from('jamb_sync_jobs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setJob(data as any);
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

  const loadAdmins = async () => {
    const { data: roleRows } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    const ids = (roleRows || []).map((r: any) => r.user_id);
    if (!ids.length) return;
    const { data } = await supabase.from('profiles').select('id, firstname, lastname, email').in('id', ids);
    setAdmins((data as any) || []);
  };

  const totalSteps = job ? job.subjects.length * job.years.length * job.pages : 0;
  const doneSteps = job
    ? Math.max(0, job.subjects.indexOf(job.current_subject ?? '') * job.years.length * job.pages
      + job.years.indexOf(job.current_year ?? 0) * job.pages
      + job.current_page)
    : 0;
  const pct = totalSteps ? Math.min(100, Math.round((doneSteps / totalSteps) * 100)) : 0;
  const canResume = job && (job.status === 'failed' || job.status === 'paused');
  const isRunning = job?.status === 'running';

  return (
    <div className="space-y-4">
      <Card className="bg-white border-blue-100">
        <CardHeader><CardTitle className="text-slate-800">JAMB ALOC Sync</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Pulls past questions for 8 subjects × 16 years (2009–2024). Progress is saved as questions arrive,
            so if the sync stops you can resume from where it left off.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => invoke({ action: 'start', total: 40, pages: 2 }, 'Sync started')} disabled={busy || isRunning} className="bg-blue-600 hover:bg-blue-700">
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Start new sync
            </Button>
            <Button onClick={() => invoke({ action: 'resume' }, 'Sync resumed')} disabled={busy || isRunning || !canResume} variant="outline">
              <Play className="h-4 w-4 mr-2" /> Resume last
            </Button>
            <Button onClick={loadLatest} variant="ghost" disabled={busy}>Refresh status</Button>
          </div>

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

      <Card className="bg-white border-blue-100">
        <CardHeader><CardTitle className="text-slate-800">Override Admin Visibility</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={loadAdmins}>Load admins</Button>
            <Select value={adminId} onValueChange={setAdminId}>
              <SelectTrigger className="w-80"><SelectValue placeholder="Select an admin to override" /></SelectTrigger>
              <SelectContent>
                {admins.map(a => <SelectItem key={a.id} value={a.id}>{a.firstname} {a.lastname} — {a.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {adminId && <JambQuestionsManager overrideAdminId={adminId} />}
        </CardContent>
      </Card>
    </div>
  );
}
