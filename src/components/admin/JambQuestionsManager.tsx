import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const SUBJECTS = ['mathematics','english','chemistry','physics','biology','economics','literature-in-english','accounting'];
const YEARS = Array.from({ length: 16 }, (_, i) => 2009 + i);

interface PQ { id: string; subject: string; year: number; question_text: string; option_a: string|null; option_b: string|null; option_c: string|null; option_d: string|null; correct_answer: string|null }

export function JambQuestionsManager({ overrideAdminId }: { overrideAdminId?: string }) {
  const { user } = useAuth();
  const adminId = overrideAdminId || user?.id;
  const [subject, setSubject] = useState('mathematics');
  const [year, setYear] = useState<number>(2024);
  const [questions, setQuestions] = useState<PQ[]>([]);
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!adminId) return;
    setLoading(true);
    const { data: qs } = await (supabase as any)
      .from('past_questions').select('*').eq('subject', subject).eq('year', year).order('created_at');
    const list: PQ[] = qs || [];
    setQuestions(list);
    if (list.length) {
      const { data: vis } = await (supabase as any)
        .from('question_visibility').select('question_id, is_active')
        .eq('admin_id', adminId).in('question_id', list.map(q => q.id));
      const m: Record<string, boolean> = {};
      (vis || []).forEach((v: any) => { m[v.question_id] = v.is_active; });
      setActiveMap(m);
    } else setActiveMap({});
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [subject, year, adminId]);

  const toggle = async (qid: string, value: boolean) => {
    if (!adminId) return;
    setActiveMap(p => ({ ...p, [qid]: value }));
    const { error } = await (supabase as any).from('question_visibility').upsert({
      question_id: qid, admin_id: adminId, is_active: value,
      activated_at: value ? new Date().toISOString() : null, updated_by: user?.id,
    }, { onConflict: 'question_id,admin_id' });
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      setActiveMap(p => ({ ...p, [qid]: !value }));
    }
  };

  const bulk = async (value: boolean) => {
    if (!adminId || !questions.length) return;
    setBusy(true);
    const rows = questions.map(q => ({
      question_id: q.id, admin_id: adminId, is_active: value,
      activated_at: value ? new Date().toISOString() : null, updated_by: user?.id,
    }));
    const { error } = await (supabase as any).from('question_visibility').upsert(rows, { onConflict: 'question_id,admin_id' });
    setBusy(false);
    if (error) toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    else { toast({ title: `Bulk ${value ? 'activated' : 'deactivated'}` }); load(); }
  };

  const activeCount = useMemo(() => questions.filter(q => activeMap[q.id]).length, [questions, activeMap]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>JAMB Past Questions {overrideAdminId ? '(Override Mode)' : ''}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={subject} onValueChange={setSubject}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s.replace(/-/g,' ')}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Badge variant="secondary">{activeCount}/{questions.length} active</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bulk(true)} disabled={busy || !questions.length}>Activate all</Button>
            <Button size="sm" variant="outline" onClick={() => bulk(false)} disabled={busy || !questions.length}>Deactivate all</Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !questions.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No questions for this subject/year. Ask a super admin to sync from ALOC.
          </p>
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id} className="p-3">
                <div className="flex gap-3 items-start">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Q{idx+1}. {q.question_text}</div>
                    <div className="text-xs text-muted-foreground mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <span>A. {q.option_a}</span><span>B. {q.option_b}</span>
                      <span>C. {q.option_c}</span><span>D. {q.option_d}</span>
                    </div>
                    <div className="text-xs mt-1 text-primary">Correct: {q.correct_answer?.toUpperCase()}</div>
                  </div>
                  <Switch checked={!!activeMap[q.id]} onCheckedChange={(v) => toggle(q.id, v)} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
