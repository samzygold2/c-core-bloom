import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TestTimer } from '@/components/TestTimer';
import { Loader2, ChevronLeft, ChevronRight, Calendar, BookOpen, Layers, Clock, ArrowLeft, Play } from 'lucide-react';
import { toast } from 'sonner';

const SUBJECTS = [
  'mathematics', 'english', 'chemistry', 'physics', 'biology',
  'economics', 'literature-in-english', 'accounting', 'government',
  'commerce', 'geography', 'crk', 'irk', 'civic-education', 'history',
];
const YEARS = Array.from({ length: 16 }, (_, i) => 2024 - i);

type Step = 'year' | 'mode' | 'single-timer' | 'single-subjects' | 'multi-timer' | 'multi-subjects' | 'test' | 'review';

interface PQ {
  id: string; subject: string; year: number;
  question_text: string; option_a: string | null; option_b: string | null;
  option_c: string | null; option_d: string | null;
  correct_answer: string | null; explanation: string | null;
}

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function JambPractice() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('year');
  const [year, setYear] = useState<number | null>(null);
  const [mode, setMode] = useState<'single' | 'multi' | null>(null);
  const [timerMins, setTimerMins] = useState<number | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<PQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // load active visibility once user available
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from('question_visibility').select('question_id').eq('is_active', true);
      setActiveIds(new Set((data || []).map((v: any) => v.question_id)));
    })();
  }, [user]);

  const goBack = () => {
    if (step === 'mode') setStep('year');
    else if (step === 'single-timer' || step === 'multi-timer') setStep('mode');
    else if (step === 'single-subjects') setStep('single-timer');
    else if (step === 'multi-subjects') setStep('multi-timer');
    else if (step === 'test' || step === 'review') {
      setQuestions([]); setAnswers({}); setIdx(0);
      setStep(mode === 'single' ? 'single-subjects' : 'multi-subjects');
    }
  };

  const startSingle = async (subject: string) => {
    if (!year) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('past_questions').select('*')
      .eq('subject', subject).eq('year', year).limit(40);
    const filtered = ((data || []) as PQ[]).filter(q => activeIds.has(q.id));
    setLoading(false);
    if (!filtered.length) { toast.error('No active questions for this selection.'); return; }
    setSelectedSubjects([subject]);
    setQuestions(filtered);
    setIdx(0); setAnswers({});
    setStep('test');
  };

  const startMulti = async () => {
    if (!year || selectedSubjects.length < 2) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from('past_questions').select('*')
      .eq('year', year).in('subject', selectedSubjects);
    const filtered = ((data || []) as PQ[]).filter(q => activeIds.has(q.id));
    setLoading(false);
    if (!filtered.length) { toast.error('No active questions for the chosen subjects.'); return; }
    // shuffle lightly
    filtered.sort(() => Math.random() - 0.5);
    setQuestions(filtered);
    setIdx(0); setAnswers({});
    setStep('test');
  };

  const score = useMemo(
    () => questions.filter(q => (answers[q.id] || '').toLowerCase() === (q.correct_answer || '').toLowerCase()).length,
    [answers, questions],
  );

  const handleTimeUp = () => { toast.info("Time's up!"); setStep('review'); };

  const subtitle =
    step === 'year' ? 'Pick a UTME year to begin' :
    step === 'mode' ? `Year ${year} • Choose your practice mode` :
    step === 'single-timer' ? 'Single subject • Set your timer' :
    step === 'single-subjects' ? `Pick a subject (${timerMins} mins)` :
    step === 'multi-timer' ? 'Multiple subjects • Set your timer' :
    step === 'multi-subjects' ? `Select 2–4 subjects (${timerMins} mins)` :
    step === 'test' ? `${selectedSubjects.map(titleCase).join(' • ')} • ${year}` :
    'Review';

  return (
    <DashboardLayout title="JAMB Practice" subtitle={subtitle}>
      <div className="space-y-4 animate-fade-in">
        {step !== 'year' && step !== 'test' && (
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}

        {/* STEP: YEAR */}
        {step === 'year' && (
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => { setYear(y); setStep('mode'); }}
                className="group rounded-xl border bg-card p-5 sm:p-6 text-left transition-all duration-200 ease-out hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
              >
                <Calendar className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <div className="mt-3 text-2xl sm:text-3xl font-bold">{y}</div>
                <div className="text-xs text-muted-foreground mt-1">UTME Past Questions</div>
              </button>
            ))}
          </div>
        )}

        {/* STEP: MODE */}
        {step === 'mode' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => { setMode('single'); setTimerMins(null); setStep('single-timer'); }}
              className="group rounded-xl border bg-card p-6 text-left transition-all duration-200 ease-out hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
            >
              <BookOpen className="h-8 w-8 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">Single Question</h3>
              <p className="text-sm text-muted-foreground mt-1">Practice one subject at a time. Choose 15 or 30 mins.</p>
            </button>
            <button
              onClick={() => { setMode('multi'); setTimerMins(null); setSelectedSubjects([]); setStep('multi-timer'); }}
              className="group rounded-xl border bg-card p-6 text-left transition-all duration-200 ease-out hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
            >
              <Layers className="h-8 w-8 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">Multiple Questions</h3>
              <p className="text-sm text-muted-foreground mt-1">Combine 2–4 subjects. 30 mins, 1 hr or 2 hrs.</p>
            </button>
          </div>
        )}

        {/* STEP: SINGLE TIMER */}
        {step === 'single-timer' && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Set timer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[15, 30].map(m => (
                  <button
                    key={m}
                    onClick={() => setTimerMins(m)}
                    className={`rounded-lg border p-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5 ${
                      timerMins === m ? 'border-primary bg-primary/10' : 'hover:border-primary'
                    }`}
                  >
                    <div className="text-2xl font-bold">{m}</div>
                    <div className="text-xs text-muted-foreground">minutes</div>
                  </button>
                ))}
              </div>
              <Button disabled={!timerMins} onClick={() => setStep('single-subjects')} className="w-full">Enter</Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: SINGLE SUBJECTS */}
        {step === 'single-subjects' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {loading && <div className="col-span-full flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {!loading && SUBJECTS.map(s => (
              <Card key={s} className="transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{titleCase(s)}</div>
                    <div className="text-xs text-muted-foreground">{year} • {timerMins} mins</div>
                  </div>
                  <Button size="sm" onClick={() => startSingle(s)}>
                    <Play className="h-4 w-4 mr-1" /> Start
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* STEP: MULTI TIMER */}
        {step === 'multi-timer' && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Set timer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[{ m: 30, l: '30 mins' }, { m: 60, l: '1 hour' }, { m: 120, l: '2 hours' }].map(({ m, l }) => (
                  <button
                    key={m}
                    onClick={() => setTimerMins(m)}
                    className={`rounded-lg border p-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5 ${
                      timerMins === m ? 'border-primary bg-primary/10' : 'hover:border-primary'
                    }`}
                  >
                    <div className="text-xl font-bold">{l}</div>
                  </button>
                ))}
              </div>
              <Button disabled={!timerMins} onClick={() => setStep('multi-subjects')} className="w-full">Enter</Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: MULTI SUBJECTS */}
        {step === 'multi-subjects' && (
          <Card>
            <CardHeader>
              <CardTitle>Select subjects</CardTitle>
              <p className="text-sm text-muted-foreground">Choose minimum 2 and maximum 4. Selected: {selectedSubjects.length}/4</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SUBJECTS.map(s => {
                  const sel = selectedSubjects.includes(s);
                  const disabled = !sel && selectedSubjects.length >= 4;
                  return (
                    <button
                      key={s}
                      disabled={disabled}
                      onClick={() => setSelectedSubjects(p => sel ? p.filter(x => x !== s) : [...p, s])}
                      className={`rounded-lg border p-3 text-sm text-left transition-all duration-200 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                        sel ? 'border-primary bg-primary/10' : 'hover:border-primary'
                      }`}
                    >
                      {titleCase(s)}
                    </button>
                  );
                })}
              </div>
              <Button
                disabled={selectedSubjects.length < 2 || loading}
                onClick={startMulti}
                className="w-full"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4 mr-1" /> Start Practice</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: TEST */}
        {step === 'test' && questions[idx] && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Question {idx + 1} of {questions.length}</CardTitle>
                <Badge variant="secondary">{titleCase(questions[idx].subject)}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="font-medium whitespace-pre-wrap">{questions[idx].question_text}</p>
                <div className="space-y-2">
                  {(['a', 'b', 'c', 'd'] as const).map(opt => {
                    const text = (questions[idx] as any)[`option_${opt}`];
                    if (!text) return null;
                    const selected = answers[questions[idx].id] === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setAnswers(p => ({ ...p, [questions[idx].id]: opt }))}
                        className={`w-full text-left px-3 py-2 rounded border transition-all duration-200 ${
                          selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                        }`}
                      >
                        <span className="font-semibold mr-2">{opt.toUpperCase()}.</span>{text}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  {idx === questions.length - 1 ? (
                    <Button onClick={() => setStep('review')}>Submit</Button>
                  ) : (
                    <Button size="sm" onClick={() => setIdx(i => i + 1)}>
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="lg:w-56 space-y-3">
              {timerMins && <TestTimer durationMinutes={timerMins} onTimeUp={handleTimeUp} />}
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">Navigator</div>
                  <div className="grid grid-cols-6 lg:grid-cols-5 gap-1">
                    {questions.map((q, i) => (
                      <button
                        key={q.id}
                        onClick={() => setIdx(i)}
                        className={`h-8 text-xs rounded border transition-colors ${
                          i === idx ? 'border-primary bg-primary text-primary-foreground' :
                          answers[q.id] ? 'border-primary/50 bg-primary/10' : 'border-border'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* STEP: REVIEW */}
        {step === 'review' && (
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <p className="text-sm text-muted-foreground">You scored {score} / {questions.length}</p>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
              {questions.map((q, i) => {
                const user = (answers[q.id] || '').toLowerCase();
                const correct = (q.correct_answer || '').toLowerCase();
                return (
                  <div key={q.id} className="border rounded-lg p-3 space-y-2">
                    <div className="text-sm font-medium">{i + 1}. {q.question_text}</div>
                    <div className="text-xs">
                      Your answer: <span className={user === correct ? 'text-green-600' : 'text-destructive'}>{user.toUpperCase() || '—'}</span>
                      {' • '}Correct: <span className="text-green-600">{correct.toUpperCase() || '—'}</span>
                    </div>
                    {q.explanation && <div className="text-xs bg-muted p-2 rounded">{q.explanation}</div>}
                  </div>
                );
              })}
              <Button onClick={() => { setStep('year'); setYear(null); setMode(null); setTimerMins(null); setSelectedSubjects([]); setQuestions([]); setAnswers({}); setIdx(0); }} className="w-full">
                Practice another
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
