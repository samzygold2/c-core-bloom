import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { TestTimer } from '@/components/TestTimer';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Loader2, Send } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

interface Question {
  id: string;
  question_text: string;
  options: string[];
}

interface ShuffledQuestion extends Question {
  shuffledOptions: { text: string; originalIndex: number }[];
}

interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  total_questions: number;
}

const TestTaking = () => {
  const { testId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<ShuffledQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({}); // Stores ORIGINAL indices
  const [loading, setLoading] = useState(true);
  const [userTestId, setUserTestId] = useState<string>('');
  const [sessionStartTime, setSessionStartTime] = useState<number | undefined>(undefined);

  // Auto-save test session to localStorage as answers, question, or session changes
  useEffect(() => {
    if (loading || !user || !testId || !userTestId) return;
    const sessionData = {
      userTestId,
      startTime: sessionStartTime || Date.now(),
      questions,
      answers,
      currentQuestionIndex,
    };
    localStorage.setItem(`jamb_test_session_${testId}_${user.id}`, JSON.stringify(sessionData));
  }, [answers, currentQuestionIndex, questions, userTestId, testId, user, loading, sessionStartTime]);

  // Connection lost / Connection restored listeners
  useEffect(() => {
    const handleOnline = () => {
      toast({
        title: 'Back online',
        description: 'Keep going. Your answers are still saved on this device.',
      });
    };

    const handleOffline = () => {
      toast({
        title: 'You are offline',
        description: 'Keep answering. Your answers are saved on this device; reconnect before you submit.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  const initializeTest = useCallback(async () => {
    if (!user || !testId) return;
    const savedSessionKey = `jamb_test_session_${testId}_${user.id}`;
    const savedSessionStr = localStorage.getItem(savedSessionKey);

    const { data: testData, error: testError } = await supabase
      .from('tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (testError || !testData) {
      toast({
        title: 'Could not open this test',
        description: 'It may have been closed by your tutor. Try again from My tests.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    if (savedSessionStr) {
      try {
        const savedSession = JSON.parse(savedSessionStr);
        if (savedSession && savedSession.userTestId) {
          const elapsedSeconds = Math.floor((Date.now() - savedSession.startTime) / 1000);
          const remaining = (testData.duration_minutes * 60) - elapsedSeconds;
          
          if (remaining > 0) {
            setTest(testData);
            setQuestions(savedSession.questions || []);
            setAnswers(savedSession.answers || {});
            setCurrentQuestionIndex(savedSession.currentQuestionIndex || 0);
            setUserTestId(savedSession.userTestId);
            setSessionStartTime(savedSession.startTime);
            setLoading(false);
            
            toast({
              title: 'Picked up where you left off',
              description: 'Your answers and the clock were restored.',
            });
            return;
          } else {
            localStorage.removeItem(savedSessionKey);
          }
        }
      } catch (e) {
        console.error('Failed to restore saved session:', e);
      }
    }

    const { data: questionsData, error: questionsError } = await supabase
      .from('user_questions')
      .select('id, test_id, question_text, options, difficulty, created_at')
      .eq('test_id', testId);

    if (questionsError || !questionsData || questionsData.length === 0) {
      toast({
        title: 'Could not load the questions',
        description: questionsData?.length === 0 ? 'This test has no questions yet. Let your tutor know.' : 'Check your connection and try again.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    // Type assertion for options field
    const typedQuestions: Question[] = questionsData.map(q => ({
      ...q,
      options: q.options as unknown as string[]
    }));

    // Shuffle questions and their options
    const shuffledQuestions: ShuffledQuestion[] = [...typedQuestions]
      .sort(() => Math.random() - 0.5)
      .map(q => {
        // Create shuffled options with original index mapping
        const optionsWithIndex = q.options.map((text, originalIndex) => ({ text, originalIndex }));
        const shuffledOptions = [...optionsWithIndex].sort(() => Math.random() - 0.5);
        return {
          ...q,
          shuffledOptions
        };
      });

    const now = Date.now();
    const { data: userTest, error: userTestError } = await supabase
      .from('user_tests')
      .insert({
        user_id: user.id,
        test_id: testId,
        answers: {},
      })
      .select()
      .single();

    if (userTestError || !userTest) {
      toast({
        title: 'Could not start the test',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    setTest(testData);
    setQuestions(shuffledQuestions);
    setUserTestId(userTest.id);
    setSessionStartTime(now);
    setLoading(false);
  }, [user, testId, navigate, toast]);

  const checkUserApprovalAndInit = useCallback(async () => {
    if (!user) return;
    // Check if user is approved (not pending and not waiting)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_pending, is_waiting')
      .eq('id', user.id)
      .single();

    if (error || !profile) {
      toast({
        title: 'Could not check your account',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    if (profile.is_pending || profile.is_waiting) {
      toast({
        title: 'Not approved yet',
        description: 'Your tutor needs to approve your account before you can take tests.',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    initializeTest();
  }, [user, navigate, toast, initializeTest]);

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    
    if (!user || !testId) {
      navigate('/auth');
      return;
    }
    
    checkUserApprovalAndInit();
  }, [user, testId, authLoading, navigate, checkUserApprovalAndInit]);

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleAnswerSelect = (questionId: string, originalIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: originalIndex,
    }));
  };

  const handleSubmit = async () => {
    if (!userTestId) return;

    try {
      // Use secure server-side scoring function
      const { data, error } = await supabase.rpc('score_test', {
        p_test_session_id: userTestId,
        p_user_answers: answers
      });

      if (error) throw error;

      // Clear local storage session on successful submission!
      localStorage.removeItem(`jamb_test_session_${testId}_${user!.id}`);

      toast({
        title: 'Test submitted',
        description: 'Here is how you did.',
      });
      
      navigate(`/results/${userTestId}`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Your answers are still saved. Try submitting again.';
      toast({
        title: 'Could not submit',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  const canGoNext = currentQuestionIndex < questions.length - 1;
  const canGoPrev = currentQuestionIndex > 0;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Preparing your questions…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-3 sm:p-4 lg:p-6">
      <div className="mx-auto w-full max-w-3xl lg:max-w-4xl">
        <div className="mb-3 sm:mb-4">
          <BackButton to="/dashboard" label="Leave test" className="h-11 sm:h-10" />
        </div>
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold break-words">{test?.title}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          {test && <TestTimer durationMinutes={test.duration_minutes} onTimeUp={handleSubmit} startTime={sessionStartTime} />}
        </div>

        <Progress value={progress} className="mb-4 sm:mb-6" />

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-xl leading-relaxed">{currentQuestion?.question_text}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
            <RadioGroup
              value={answers[currentQuestion?.id]?.toString() || ''}
              onValueChange={(value) => handleAnswerSelect(currentQuestion.id, parseInt(value))}
            >
              {currentQuestion?.shuffledOptions.map((option, displayIndex) => (
                <Label
                  key={displayIndex}
                  htmlFor={`option-${displayIndex}`}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 sm:p-4 text-sm sm:text-base font-normal leading-relaxed transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                >
                  <RadioGroupItem value={option.originalIndex.toString()} id={`option-${displayIndex}`} className="mt-1 shrink-0" />
                  <span className="min-w-0 flex-1 break-words">{option.text}</span>
                </Label>
              ))}
            </RadioGroup>

            <div className="flex justify-between pt-3 sm:pt-4 gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1 sm:h-10 sm:flex-none"
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                disabled={!canGoPrev}
              >
                <ChevronLeft className="mr-1 sm:mr-2 h-4 w-4" />
                Previous
              </Button>

              {canGoNext ? (
                <Button
                  className="h-11 flex-1 sm:h-10 sm:flex-none"
                  onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 sm:ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button className="h-11 flex-1 sm:h-10 sm:flex-none" onClick={handleSubmit}>
                  Submit test
                  <Send className="ml-1 sm:ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestTaking;