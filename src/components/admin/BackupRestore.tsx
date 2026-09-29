import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Upload, HardDriveDownload, Loader2 } from 'lucide-react';

// Ordered so that parent tables are restored before tables that reference them.
const BACKUP_TABLES: { name: string; label: string }[] = [
  { name: 'profiles', label: 'Profiles' },
  { name: 'user_roles', label: 'User Roles' },
  { name: 'user_admins', label: 'User ↔ Admin Links' },
  { name: 'system_config', label: 'System Config' },
  { name: 'tests', label: 'Tests' },
  { name: 'questions', label: 'Test Questions' },
  { name: 'user_tests', label: 'Test Results' },
  { name: 'past_questions', label: 'JAMB Questions' },
  { name: 'question_visibility', label: 'JAMB Visibility' },
  { name: 'jamb_sync_jobs', label: 'JAMB Sync Jobs' },
  { name: 'password_reset_requests', label: 'Password Reset Requests' },
  { name: 'audit_log', label: 'Audit Log' },
  { name: 'system_logs', label: 'System Logs' },
  { name: 'jamb_integrity_audit_log', label: 'JAMB Integrity Log' },
];

const PAGE = 1000;
const CHUNK = 500;

interface BackupFile {
  app: 'cbt-backup';
  version: 1;
  created_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const BackupRestore = () => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(BACKUP_TABLES.map((t) => t.name));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState<'overwrite' | 'skip'>('overwrite');
  const [report, setReport] = useState<{ table: string; ok: number; failed: number; error?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (name: string) =>
    setSelected((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]));

  const fetchAll = async (table: string) => {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await (supabase as any).from(table).select('*').range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  };

  const download = async (tables: string[]) => {
    if (!tables.length) return;
    setBusy(true);
    setReport([]);
    try {
      const backup: BackupFile = { app: 'cbt-backup', version: 1, created_at: new Date().toISOString(), tables: {} };
      for (let i = 0; i < tables.length; i++) {
        setStatus(`Downloading ${tables[i]}…`);
        backup.tables[tables[i]] = await fetchAll(tables[i]);
        setProgress(Math.round(((i + 1) / tables.length) * 100));
      }
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = tables.length === 1 ? `backup-${tables[0]}-${stamp}.json` : `backup-full-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const total = Object.values(backup.tables).reduce((n, r) => n + r.length, 0);
      toast({ title: 'Backup ready', description: `${total.toLocaleString()} records downloaded.` });
    } catch (e: any) {
      toast({ title: 'Backup failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setStatus('');
      setProgress(0);
    }
  };

  const restore = async (file: File) => {
    setBusy(true);
    setReport([]);
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (parsed?.app !== 'cbt-backup' || typeof parsed.tables !== 'object') {
        throw new Error('This file is not a valid backup from this app.');
      }
      const order = BACKUP_TABLES.map((t) => t.name).filter((n) => Array.isArray(parsed.tables[n]));
      const totalRows = order.reduce((n, t) => n + parsed.tables[t].length, 0) || 1;
      let done = 0;
      const results: typeof report = [];
      for (const table of order) {
        const rows = parsed.tables[table];
        let ok = 0, failed = 0, lastError: string | undefined;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          setStatus(`Restoring ${table} (${i + chunk.length}/${rows.length})…`);
          const { error } = await (supabase as any)
            .from(table)
            .upsert(chunk, { onConflict: 'id', ignoreDuplicates: mode === 'skip' });
          if (!error) ok += chunk.length;
          else {
            // Fall back to row-by-row so one bad record doesn't block the rest
            for (const row of chunk) {
              const { error: e2 } = await (supabase as any)
                .from(table)
                .upsert(row, { onConflict: 'id', ignoreDuplicates: mode === 'skip' });
              if (e2) { failed++; lastError = e2.message; } else ok++;
            }
          }
          done += chunk.length;
          setProgress(Math.round((done / totalRows) * 100));
        }
        results.push({ table, ok, failed, error: lastError });
        setReport([...results]);
      }
      const failedTotal = results.reduce((n, r) => n + r.failed, 0);
      toast({
        title: failedTotal ? 'Restore finished with some issues' : 'Restore complete',
        description: `${results.reduce((n, r) => n + r.ok, 0).toLocaleString()} records restored${failedTotal ? `, ${failedTotal} failed` : ''}.`,
        variant: failedTotal ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Restore failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setStatus('');
      setProgress(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HardDriveDownload className="h-5 w-5" /> Backup & Restore
        </CardTitle>
        <CardDescription>
          Download selected tables (single or bulk) as a backup file, and upload a backup to restore the data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelected(BACKUP_TABLES.map((t) => t.name))} disabled={busy}>Select all</Button>
          <Button size="sm" variant="outline" onClick={() => setSelected([])} disabled={busy}>Clear</Button>
          <Badge variant="secondary" className="self-center">{selected.length} selected</Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {BACKUP_TABLES.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={selected.includes(t.name)} onCheckedChange={() => toggle(t.name)} disabled={busy} />
                {t.label}
              </label>
              <Button size="icon" variant="ghost" className="h-7 w-7" title={`Download ${t.label} only`} onClick={() => download([t.name])} disabled={busy}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button onClick={() => download(BACKUP_TABLES.map((t) => t.name).filter((n) => selected.includes(n)))} disabled={busy || !selected.length}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download backup ({selected.length})
          </Button>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="flex gap-4">
              <div className="flex items-center gap-1.5"><RadioGroupItem value="overwrite" id="m-over" /><Label htmlFor="m-over" className="text-xs">Overwrite existing</Label></div>
              <div className="flex items-center gap-1.5"><RadioGroupItem value="skip" id="m-skip" /><Label htmlFor="m-skip" className="text-xs">Only add missing</Label></div>
            </RadioGroup>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); }} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4 mr-2" /> Restore from file
            </Button>
          </div>
        </div>

        {busy && (
          <div className="space-y-1">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">{status}</p>
          </div>
        )}

        {report.length > 0 && (
          <div className="rounded-md border divide-y text-sm">
            {report.map((r) => (
              <div key={r.table} className="flex flex-wrap items-center justify-between gap-2 p-2">
                <span className="font-medium">{r.table}</span>
                <span className="text-xs">
                  <Badge variant="secondary">{r.ok} restored</Badge>{' '}
                  {r.failed > 0 && <Badge variant="destructive" title={r.error}>{r.failed} failed</Badge>}
                </span>
                {r.error && <p className="w-full text-xs text-destructive">{r.error}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Note: login passwords are not part of the backup. Restored profiles only work for accounts that still exist.
        </p>
      </CardContent>
    </Card>
  );
};

export default BackupRestore;
