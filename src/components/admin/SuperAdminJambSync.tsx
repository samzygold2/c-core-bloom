import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, RefreshCw } from 'lucide-react';
import { JambQuestionsManager } from './JambQuestionsManager';

export function SuperAdminJambSync() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [adminId, setAdminId] = useState<string>('');
  const [admins, setAdmins] = useState<{ id: string; firstname: string; lastname: string; email: string }[]>([]);

  const loadAdmins = async () => {
    const { data: roleRows } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    const ids = (roleRows || []).map((r: any) => r.user_id);
    if (!ids.length) return;
    const { data } = await supabase.from('profiles').select('id, firstname, lastname, email').in('id', ids);
    setAdmins((data as any) || []);
  };

  const sync = async () => {
    setSyncing(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke('aloc-sync', {
      body: { total: 40, pages: 2, background: true },
    });
    setSyncing(false);
    if (error) toast({ title: 'Sync failed', description: error.message, variant: 'destructive' });
    else {
      setResult(data);
      toast({
        title: data?.status === 'started' ? 'Sync started' : 'Sync complete',
        description: data?.message ?? `Imported ${data?.inserted ?? 0} questions`,
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-white border-blue-100">
        <CardHeader>
          <CardTitle className="text-slate-800">JAMB ALOC Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            Pulls past questions for 8 subjects × 16 years (2009–2024) from the ALOC API and upserts into the database.
            Estimated 2–5 minutes.
          </p>
          <Button onClick={sync} disabled={syncing} className="bg-blue-600 hover:bg-blue-700">
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {syncing ? 'Syncing…' : 'Sync from ALOC'}
          </Button>
          {result && (
            <pre className="text-xs bg-slate-50 p-3 rounded border overflow-auto max-h-60">{JSON.stringify(result, null, 2)}</pre>
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
