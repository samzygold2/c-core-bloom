import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

const SUBJECTS = ['mathematics','english','chemistry','physics','biology','economics','literature-in-english','accounting'];
const YEARS = Array.from({ length: 16 }, (_, i) => 2009 + i);

interface PQ { id: string; subject: string; year: number; question_text: string; option_a: string|null; option_b: string|null; option_c: string|null; option_d: string|null; correct_answer: string|null; explanation: string|null }

export default function JambPractice() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('mathematics');
  const [year, setYear] = useState<number>(2024);
  const [questions, setQuestions] = useState<PQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true); setIdx(0); setAnswers({}); setSubmitted(false);
    // get active visibility rows for this user's admins
    const { data: vis } = await (supabase as any)
      .from('question_visibility').select('question_id').eq('is_active', true);
    const ids = Array.from(new Set((vis || []).map((v: any) => v.question_id)));
    if (!ids.length) { setQuestions([]); setLoading(false); return; }
    const { data: qs } = await (supabase as any)
      .from('past_questions').select('*').eq('subject', subject).eq('year', year).in('id', ids);
    setQuestions((qs || []) as PQ[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [subject, year, user]);

  const q = questions[idx];
  const score = useMemo(() => questions.filter(qq => (answers[qq.id] || '').toLowerCase() === (qq.correct_answer || '').toLowerCase()).length, [answers, questions]);

  return (
    <DashboardLayout title="JAMB Past Questions" subtitle="Practice 15 years of UTME past questions">
      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Choose subject & year</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-center">
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s.replace(/-/g,' ')}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Badge variant="secondary">{questions.length} questions</Badge>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : !questions.length ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            No active questions for this selection. Ask your admin to activate JAMB questions.
          </CardContent></Card>
        ) : q ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Question {idx+1} of {questions.length}</CardTitle>
              {submitted && <Badge>Score: {score}/{questions.length}</Badge>}
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="font-medium">{q.question_text}</p>
              <div className="space-y-2">
                {(['a','b','c','d'] as const).map(opt => {
                  const text = (q as any)[`option_${opt}`];
                  if (!text) return null;
                  const selected = answers[q.id] === opt;
                  const correct = submitted && (q.correct_answer || '').toLowerCase() === opt;
                  const wrong = submitted && selected && !correct;
                  return (
                    <button key={opt} disabled={submitted}
                      onClick={() => setAnswers(p => ({ ...p, [q.id]: opt }))}
                      className={`w-full text-left px-3 py-2 rounded border transition ${
                        correct ? 'border-green-500 bg-green-500/10' : wrong ? 'border-destructive bg-destructive/10' :
                        selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                      }`}>
                      <span className="font-semibold mr-2">{opt.toUpperCase()}.</span>{text}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <div className="text-sm bg-muted p-3 rounded"><strong>Explanation:</strong> {q.explanation}</div>
              )}
              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" disabled={idx===0} onClick={() => setIdx(i => i-1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                {idx === questions.length - 1 && !submitted ? (
                  <Button onClick={() => setSubmitted(true)}>Submit</Button>
                ) : (
                  <Button size="sm" disabled={idx===questions.length-1} onClick={() => setIdx(i => i+1)}>
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
