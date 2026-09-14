import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TestTimer } from '@/components/TestTimer';
import { Loader2, ChevronLeft, ChevronRight, Calendar, BookOpen, Layers, Clock, ArrowLeft, Play, Calculator, X, Award, CheckCircle2, XCircle, HelpCircle, RefreshCw } from 'lucide-react';
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
  image_url: string | null;
}

const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function CbtCalculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [prevVal, setPrevVal] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  const calc = (a: number, b: number, operator: string) => {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleDigit = (d: string) => {
    if (display === '0' || resetNext) {
      setDisplay(d);
      setResetNext(false);
    } else {
      if (display.length < 12) setDisplay(display + d);
    }
  };

  const handleOp = (nextOp: string) => {
    const current = parseFloat(display);
    if (prevVal === null) {
      setPrevVal(current);
    } else if (op) {
      const res = calc(prevVal, current, op);
      setPrevVal(res);
      setDisplay(String(Number(res.toFixed(6))));
    }
    setOp(nextOp);
    setResetNext(true);
  };

  const handleEqual = () => {
    if (prevVal !== null && op) {
      const current = parseFloat(display);
      const res = calc(prevVal, current, op);
      setDisplay(String(Number(res.toFixed(6))));
      setPrevVal(null);
      setOp(null);
      setResetNext(true);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevVal(null);
    setOp(null);
    setResetNext(false);
  };

  const handleSqrt = () => {
    const current = parseFloat(display);
    if (current >= 0) {
      setDisplay(String(Number(Math.sqrt(current).toFixed(6))));
      setResetNext(true);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 bg-card border rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95">
      <div className="flex items-center justify-between pb-2 border-b mb-3">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Calculator className="h-4 w-4 text-primary" />
          <span>JAMB CBT Calculator</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="bg-slate-900 text-emerald-400 font-mono text-right text-xl p-3 rounded-lg mb-3 overflow-x-auto min-h-[48px] flex items-center justify-end">
        {display}
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Button variant="destructive" size="sm" onClick={handleClear} className="col-span-2">C / AC</Button>
        <Button variant="outline" size="sm" onClick={handleSqrt}>√</Button>
        <Button variant="secondary" size="sm" onClick={() => handleOp('/')}>÷</Button>

        {['7','8','9'].map(d => <Button key={d} variant="outline" size="sm" onClick={() => handleDigit(d)}>{d}</Button>)}
        <Button variant="secondary" size="sm" onClick={() => handleOp('*')}>×</Button>

        {['4','5','6'].map(d => <Button key={d} variant="outline" size="sm" onClick={() => handleDigit(d)}>{d}</Button>)}
        <Button variant="secondary" size="sm" onClick={() => handleOp('-')}>-</Button>

        {['1','2','3'].map(d => <Button key={d} variant="outline" size="sm" onClick={() => handleDigit(d)}>{d}</Button>)}
        <Button variant="secondary" size="sm" onClick={() => handleOp('+')}>+</Button>

        <Button variant="outline" size="sm" onClick={() => handleDigit('0')} className="col-span-2">0</Button>
        <Button variant="outline" size="sm" onClick={() => handleDigit('.')}>.</Button>
        <Button size="sm" onClick={handleEqual} className="bg-primary text-primary-foreground">=</Button>
      </div>
    </div>
  );
}

export default function JambPractice() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('year');
  const [year, setYear] = useState<number | null>(null);
  const [mode, setMode] = useState<'single' | 'multi' | null>(null);
  const [timerMins, setTimerMins] = useState<number | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [available, setAvailable] = useState<Record<string, number>>({});
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [questions, setQuestions] = useState<PQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showCalc, setShowCalc] = useState(false);

  // Load which subjects actually have approved questions for the chosen year.
  useEffect(() => {
    if (!user || !year) return;
    let cancelled = false;
    (async () => {
      setSubjectsLoading(true);
      const { data, error } = await supabase.rpc('jamb_available_subjects', { _year: year });
      if (cancelled) return;
      if (error) {
        console.error('Failed to load available subjects', error);
        setAvailable({});
      } else {
        const map: Record<string, number> = {};
        (data as { subject: string; cnt: number }[] | null)?.forEach(r => {
          map[r.subject] = Number(r.cnt);
        });
        setAvailable(map);
      }
      setSubjectsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, year]);


  // Keyboard shortcut support for CBT standard
  useEffect(() => {
    if (step !== 'test' || !questions.length) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (['a', 'b', 'c', 'd'].includes(key)) {
        const currentQ = questions[idx];
        if (currentQ) {
          setAnswers(p => ({ ...p, [currentQ.id]: key }));
        }
      } else if (key === 'n' || e.key === 'ArrowRight') {
        setIdx(i => Math.min(questions.length - 1, i + 1));
      } else if (key === 'p' || e.key === 'ArrowLeft') {
        setIdx(i => Math.max(0, i - 1));
      } else if (key === 's') {
        if (idx === questions.length - 1) {
          setStep('review');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, questions, idx]);

  const goBack = () => {
    if (step === 'mode') setStep('year');
    else if (step === 'single-timer' || step === 'multi-timer') setStep('mode');
    else if (step === 'single-subjects') setStep('single-timer');
    else if (step === 'multi-subjects') setStep('multi-timer');
    else if (step === 'test' || step === 'review') {
      setQuestions([]); setAnswers({}); setIdx(0); setShowCalc(false);
      setStep(mode === 'single' ? 'single-subjects' : 'multi-subjects');
    }
  };

  const startSingle = async (subject: string) => {
    if (!year) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('jamb_active_questions', {
      _year: year, _subjects: [subject], _limit: 40,
    });
    const fetched = (data || []) as PQ[];
    setLoading(false);
    if (error) { toast.error('Could not load questions. Please try again.'); return; }
    if (!fetched.length) { toast.error('No questions available for this selection.'); return; }
    setSelectedSubjects([subject]);
    setQuestions(fetched);
    setIdx(0); setAnswers({}); setShowCalc(false);
    setStep('test');
  };

  const startMulti = async () => {
    if (!year || selectedSubjects.length < 2) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('jamb_active_questions', {
      _year: year, _subjects: selectedSubjects, _limit: selectedSubjects.length * 40,
    });
    const fetched = (data || []) as PQ[];
    setLoading(false);
    if (error) { toast.error('Could not load questions. Please try again.'); return; }
    if (!fetched.length) { toast.error('No questions available for the chosen subjects.'); return; }
    // Group questions by subject to keep clean JAMB CBT subject sections
    fetched.sort((a, b) => a.subject.localeCompare(b.subject));
    setQuestions(fetched);
    setIdx(0); setAnswers({}); setShowCalc(false);
    setStep('test');
  };


  const availableSubjects = useMemo(
    () => SUBJECTS.filter(s => (available[s] || 0) > 0),
    [available],
  );

  const score = useMemo(
    () => questions.filter(q => (answers[q.id] || '').toLowerCase() === (q.correct_answer || '').toLowerCase()).length,
    [answers, questions],
  );

  const testSubjects = useMemo(() => {
    const list: string[] = [];
    questions.forEach(q => {
      if (!list.includes(q.subject)) list.push(q.subject);
    });
    return list;
  }, [questions]);

  const subjectBreakdown = useMemo(() => {
    const map: Record<string, { total: number; correct: number; answered: number }> = {};
    questions.forEach(q => {
      if (!map[q.subject]) map[q.subject] = { total: 0, correct: 0, answered: 0 };
      map[q.subject].total++;
      const userAns = (answers[q.id] || '').toLowerCase();
      if (userAns) map[q.subject].answered++;
      if (userAns === (q.correct_answer || '').toLowerCase()) {
        map[q.subject].correct++;
      }
    });

    return Object.entries(map).map(([sub, data]) => {
      const percent = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      const jambScaled = Math.round(percent);
      return {
        subject: sub,
        ...data,
        percent: Math.round(percent),
        jambScaled,
      };
    });
  }, [questions, answers]);

  const totalJambScore = useMemo(() => {
    if (!subjectBreakdown.length) return 0;
    if (selectedSubjects.length === 1) {
      return subjectBreakdown[0]?.jambScaled || 0;
    }
    return subjectBreakdown.reduce((acc, curr) => acc + curr.jambScaled, 0);
  }, [subjectBreakdown, selectedSubjects]);

  const handleTimeUp = () => { toast.info("Time's up! Submitting exam..."); setStep('review'); };

  const jumpToSubject = (subject: string) => {
    const firstIndex = questions.findIndex(q => q.subject === subject);
    if (firstIndex !== -1) setIdx(firstIndex);
  };

  const subtitle =
    step === 'year' ? 'Pick a UTME year to begin' :
    step === 'mode' ? `Year ${year} • Choose your practice mode` :
    step === 'single-timer' ? 'Single subject • Set your timer' :
    step === 'single-subjects' ? `Pick a subject (${timerMins} mins)` :
    step === 'multi-timer' ? 'Multiple subjects • Set your timer' :
    step === 'multi-subjects' ? `Select 2–4 subjects (${timerMins} mins)` :
    step === 'test' ? `${selectedSubjects.map(titleCase).join(' • ')} • UTME ${year}` :
    'Examination Performance & Solution Review';

  return (
    <DashboardLayout title="JAMB CBT Portal" subtitle={subtitle}>
      <div className="space-y-4 animate-fade-in relative">
        {step !== 'year' && step !== 'test' && (
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        )}

        {/* STEP: YEAR */}
        {step === 'year' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => { setYear(y); setStep('mode'); }}
                className="group rounded-xl border bg-card p-5 sm:p-6 text-left transition-all duration-200 ease-out hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
              >
                <Calendar className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <div className="mt-3 text-2xl sm:text-3xl font-bold">{y}</div>
                <div className="text-xs text-muted-foreground mt-1">JAMB UTME Questions</div>
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
              <h3 className="mt-3 text-lg font-semibold">Single Subject Practice</h3>
              <p className="text-sm text-muted-foreground mt-1">Focus on 1 subject at a time with 40 full CBT questions. 15 or 30 mins timer.</p>
            </button>
            <button
              onClick={() => { setMode('multi'); setTimerMins(null); setSelectedSubjects([]); setStep('multi-timer'); }}
              className="group rounded-xl border bg-card p-6 text-left transition-all duration-200 ease-out hover:border-primary hover:shadow-lg hover:-translate-y-0.5"
            >
              <Layers className="h-8 w-8 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">Full CBT Exam Simulation</h3>
              <p className="text-sm text-muted-foreground mt-1">Combine 2 to 4 UTME subjects together. On-screen subject tabs & timer (30m, 1h, or 2h).</p>
            </button>
          </div>
        )}

        {/* STEP: SINGLE TIMER */}
        {step === 'single-timer' && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Set Examination Timer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[15, 30].map(m => (
                  <button
                    key={m}
                    onClick={() => setTimerMins(m)}
                    className={`rounded-xl border p-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5 ${
                      timerMins === m ? 'border-primary bg-primary/10 shadow-sm' : 'hover:border-primary'
                    }`}
                  >
                    <div className="text-3xl font-bold">{m}</div>
                    <div className="text-xs text-muted-foreground mt-1">Minutes</div>
                  </button>
                ))}
              </div>
              <Button disabled={!timerMins} onClick={() => setStep('single-subjects')} className="w-full">Continue to Subject Selection</Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: SINGLE SUBJECTS */}
        {step === 'single-subjects' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(loading || subjectsLoading) && <div className="col-span-full flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
            {!loading && !subjectsLoading && availableSubjects.length === 0 && (
              <Card className="col-span-full"><CardContent className="py-10 text-center text-muted-foreground">
                No subjects have been made available for {year} yet. Please pick another year.
              </CardContent></Card>
            )}
            {!loading && !subjectsLoading && availableSubjects.map(s => (
              <Card key={s} className="transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{titleCase(s)}</div>
                    <div className="text-xs text-muted-foreground">{year} • {timerMins} mins • {Math.min(40, available[s])} Questions</div>
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
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Set Examination Duration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[{ m: 30, l: '30 mins' }, { m: 60, l: '1 hour' }, { m: 120, l: '2 hours (Standard UTME)' }].map(({ m, l }) => (
                  <button
                    key={m}
                    onClick={() => setTimerMins(m)}
                    className={`rounded-xl border p-5 text-center transition-all duration-200 ease-out hover:-translate-y-0.5 ${
                      timerMins === m ? 'border-primary bg-primary/10 shadow-sm' : 'hover:border-primary'
                    }`}
                  >
                    <div className="text-lg font-bold">{l}</div>
                  </button>
                ))}
              </div>
              <Button disabled={!timerMins} onClick={() => setStep('multi-subjects')} className="w-full">Continue to Subject Selection</Button>
            </CardContent>
          </Card>
        )}

        {/* STEP: MULTI SUBJECTS */}
        {step === 'multi-subjects' && (
          <Card>
            <CardHeader>
              <CardTitle>Select JAMB UTME Subjects</CardTitle>
              <p className="text-sm text-muted-foreground">Choose minimum 2 and maximum 4 subjects. Selected: {selectedSubjects.length}/4</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {subjectsLoading && <div className="col-span-full flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
                {!subjectsLoading && availableSubjects.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">No subjects have been made available for {year} yet.</p>
                )}
                {!subjectsLoading && availableSubjects.map(s => {
                  const sel = selectedSubjects.includes(s);
                  const disabled = !sel && selectedSubjects.length >= 4;
                  return (
                    <button
                      key={s}
                      disabled={disabled}
                      onClick={() => setSelectedSubjects(p => sel ? p.filter(x => x !== s) : [...p, s])}
                      className={`rounded-lg border p-3 text-sm text-left transition-all duration-200 ease-out hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                        sel ? 'border-primary bg-primary/10 font-semibold' : 'hover:border-primary'
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Play className="h-4 w-4 mr-1" /> Launch Full Examination</>}
              </Button>

            </CardContent>
          </Card>
        )}

        {/* STEP: TEST (FULL CBT INTERFACE) */}
        {step === 'test' && questions[idx] && (
          <div className="space-y-3">
            {/* Subject Tabs Navigation (Real CBT Standard) */}
            {testSubjects.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Subjects:</span>
                {testSubjects.map(sub => {
                  const isActive = questions[idx].subject === sub;
                  const count = questions.filter(q => q.subject === sub).length;
                  const answeredCount = questions.filter(q => q.subject === sub && answers[q.id]).length;
                  return (
                    <button
                      key={sub}
                      onClick={() => jumpToSubject(sub)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {titleCase(sub)} ({answeredCount}/{count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
              <Card className="border shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-bold">
                      Question {idx + 1} of {questions.length}
                    </CardTitle>
                    <Badge variant="secondary" className="font-semibold">{titleCase(questions[idx].subject)}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCalc(p => !p)}
                    className="h-8 gap-1 text-xs"
                  >
                    <Calculator className="h-3.5 w-3.5 text-primary" />
                    {showCalc ? 'Hide Calculator' : 'Calculator'}
                  </Button>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  {/* Question Text */}
                  <div className="font-medium text-base text-foreground leading-relaxed whitespace-pre-wrap">
                    {questions[idx].question_text}
                  </div>

                  {/* Diagram / Image if present */}
                  {questions[idx].image_url && (
                    <div className="my-3 flex justify-center bg-slate-50 dark:bg-slate-900 border rounded-xl p-3">
                      <img
                        src={questions[idx].image_url!}
                        alt="Question Diagram"
                        className="max-h-72 object-contain rounded"
                      />
                    </div>
                  )}

                  {/* Options */}
                  <div className="space-y-2.5 pt-2">
                    {(['a', 'b', 'c', 'd'] as const).map(opt => {
                      const text = questions[idx][`option_${opt}` as keyof PQ];
                      if (!text) return null;
                      const selected = answers[questions[idx].id] === opt;
                      return (
                        <button
                          key={opt}
                          onClick={() => setAnswers(p => ({ ...p, [questions[idx].id]: opt }))}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 flex items-start gap-3 ${
                            selected
                              ? 'border-primary bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary'
                              : 'border-border hover:bg-accent hover:border-slate-300'
                          }`}
                        >
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}>
                            {opt.toUpperCase()}
                          </span>
                          <span className="text-sm mt-0.5">{text}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Controls & Shortcuts Hint */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>Shortcuts:</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px] font-mono">A/B/C/D</kbd>
                      <span>select,</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px] font-mono">N</kbd>
                      <span>next,</span>
                      <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px] font-mono">P</kbd>
                      <span>prev</span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <Button variant="outline" size="sm" disabled={idx === 0} onClick={() => setIdx(i => i - 1)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                      </Button>
                      {idx === questions.length - 1 ? (
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStep('review')}>
                          Submit Examination
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => setIdx(i => i + 1)}>
                          Next Question <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Sidebar Navigator */}
              <div className="space-y-3">
                {timerMins && <TestTimer durationMinutes={timerMins} onTimeUp={handleTimeUp} />}

                <Card className="border shadow-sm">
                  <CardContent className="p-3.5 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>Question Navigator</span>
                      <span className="text-muted-foreground">
                        {Object.keys(answers).length}/{questions.length} Answered
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5 max-h-[320px] overflow-y-auto pr-1">
                      {questions.map((q, i) => {
                        const isCurrent = i === idx;
                        const isAnswered = !!answers[q.id];
                        return (
                          <button
                            key={q.id}
                            onClick={() => setIdx(i)}
                            className={`h-8 text-xs font-semibold rounded-lg border transition-all ${
                              isCurrent
                                ? 'border-primary ring-2 ring-primary ring-offset-1 bg-primary text-primary-foreground'
                                : isAnswered
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold'
                                : 'border-border bg-card hover:bg-accent'
                            }`}
                          >
                            {i + 1}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-around pt-2 border-t text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded bg-emerald-500/30 border border-emerald-500" />
                        <span>Answered</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded border border-border" />
                        <span>Unanswered</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setStep('review')}
                      className="w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                    >
                      Finish & Submit Exam
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Toggleable On-Screen Calculator */}
            {showCalc && <CbtCalculator onClose={() => setShowCalc(false)} />}
          </div>
        )}

        {/* STEP: REVIEW & RESULTS */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Header Score Card */}
            <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center md:text-left">
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Official CBT Result Sheet</Badge>
                    <h2 className="text-2xl font-bold">JAMB UTME Examination Score</h2>
                    <p className="text-sm text-slate-300">
                      Year {year} • {selectedSubjects.map(titleCase).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center px-4 py-2 bg-white/10 rounded-2xl border border-white/10">
                      <div className="text-xs text-slate-300 uppercase tracking-wider">Raw Score</div>
                      <div className="text-3xl font-extrabold text-white mt-0.5">{score} / {questions.length}</div>
                    </div>

                    <div className="text-center px-5 py-2 bg-emerald-500/20 rounded-2xl border border-emerald-500/30">
                      <div className="text-xs text-emerald-300 uppercase tracking-wider">UTME Score</div>
                      <div className="text-3xl font-extrabold text-emerald-400 mt-0.5">{totalJambScore} <span className="text-xs font-normal text-slate-300">/ {selectedSubjects.length === 1 ? 100 : 400}</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subject Breakdown Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" /> Subject Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                      <tr>
                        <th className="p-3">Subject</th>
                        <th className="p-3 text-center">Questions</th>
                        <th className="p-3 text-center">Answered</th>
                        <th className="p-3 text-center">Correct</th>
                        <th className="p-3 text-center">Accuracy</th>
                        <th className="p-3 text-right">JAMB Scale (/100)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {subjectBreakdown.map(sb => (
                        <tr key={sb.subject} className="hover:bg-accent/50">
                          <td className="p-3 font-semibold">{titleCase(sb.subject)}</td>
                          <td className="p-3 text-center">{sb.total}</td>
                          <td className="p-3 text-center">{sb.answered}</td>
                          <td className="p-3 text-center text-emerald-600 font-bold">{sb.correct}</td>
                          <td className="p-3 text-center font-semibold">{sb.percent}%</td>
                          <td className="p-3 text-right font-bold text-primary">{sb.jambScaled}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Question Review List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Solutions & Detailed Explanations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[600px] overflow-y-auto">
                {questions.map((q, i) => {
                  const userChoice = (answers[q.id] || '').toLowerCase();
                  const correctChoice = (q.correct_answer || '').toLowerCase();
                  const isCorrect = userChoice === correctChoice;

                  return (
                    <div key={q.id} className={`border rounded-xl p-4 space-y-3 transition-all ${
                      isCorrect ? 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10' : 'border-rose-200 bg-rose-50/30 dark:bg-rose-950/10'
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                          <span className="font-bold mr-1">{i + 1}.</span> {q.question_text}
                        </div>
                        <Badge variant="outline" className="shrink-0 text-xs">{titleCase(q.subject)}</Badge>
                      </div>

                      {/* Image if present */}
                      {q.image_url && (
                        <div className="my-2 flex justify-start">
                          <img src={q.image_url} alt="Question Diagram" className="max-h-52 object-contain rounded border bg-white p-2" />
                        </div>
                      )}

                      {/* Options Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                        {(['a', 'b', 'c', 'd'] as const).map(opt => {
                          const optText = q[`option_${opt}` as keyof PQ];
                          if (!optText) return null;
                          const isUser = userChoice === opt;
                          const isAns = correctChoice === opt;

                          return (
                            <div
                              key={opt}
                              className={`p-2.5 rounded-lg border flex items-center gap-2 ${
                                isAns
                                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 font-semibold'
                                  : isUser
                                  ? 'border-rose-500 bg-rose-500/10 text-rose-800 dark:text-rose-200 font-semibold'
                                  : 'border-border bg-card text-muted-foreground'
                              }`}
                            >
                              <span className="font-bold">{opt.toUpperCase()}.</span>
                              <span>{optText}</span>
                              {isAns && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 ml-auto shrink-0" />}
                              {isUser && !isAns && <XCircle className="h-3.5 w-3.5 text-rose-600 ml-auto shrink-0" />}
                            </div>
                          );
                        })}
                      </div>

                      {/* Solution / Explanation */}
                      {q.explanation && (
                        <div className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <HelpCircle className="h-3.5 w-3.5 text-primary" /> Explanation / Solution:
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{q.explanation}</div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <Button
                  onClick={() => {
                    setStep('year'); setYear(null); setMode(null); setTimerMins(null);
                    setSelectedSubjects([]); setQuestions([]); setAnswers({}); setIdx(0); setShowCalc(false);
                  }}
                  className="w-full mt-4"
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Start Another Examination
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
