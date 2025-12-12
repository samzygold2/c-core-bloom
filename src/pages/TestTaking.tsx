import { useEffect, useState } from 'react';
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
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<ShuffledQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({}); // Stores ORIGINAL indices
  const [loading, setLoading] = useState(true);
  const [userTestId, setUserTestId] = useState<string>('');

  useEffect(() => {
    if (!user || !testId) {
      navigate('/auth');
      return;
    }
    
    initializeTest();
  }, [user, testId, navigate]);

  const initializeTest = async () => {
    const { data: testData, error: testError } = await supabase
      .from('tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (testError || !testData) {
      toast({
        title: 'Error',
        description: 'Failed to load test',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    const { data: questionsData, error: questionsError } = await supabase
      .from('user_questions')
      .select('id, test_id, question_text, options, difficulty, created_at')
      .eq('test_id', testId);

    if (questionsError || !questionsData) {
      toast({
        title: 'Error',
        description: 'Failed to load questions',
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

    const { data: userTest, error: userTestError } = await supabase
      .from('user_tests')
      .insert({
        user_id: user!.id,
        test_id: testId,
        answers: {},
      })
      .select()
      .single();

    if (userTestError || !userTest) {
      toast({
        title: 'Error',
        description: 'Failed to start test session',
        variant: 'destructive',
      });
      navigate('/dashboard');
      return;
    }

    setTest(testData);
    setQuestions(shuffledQuestions);
    setUserTestId(userTest.id);
    setLoading(false);
  };

  const handleAnswerSelect = (questionId: string, originalIndex: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: originalIndex,
    }));
  };

  const handleSubmit = async () => {
    if (!userTestId) return;

    // Fetch correct answers from server (admin-only access)
    const { data: questionsWithAnswers } = await supabase
      .from('questions')
      .select('id, correct_answer')
      .eq('test_id', testId);

    let score = 0;
    questionsWithAnswers?.forEach((q) => {
      if (answers[q.id] === q.correct_answer) {
        score++;
      }
    });

    const { error } = await supabase
      .from('user_tests')
      .update({
        end_time: new Date().toISOString(),
        score,
        answers,
      })
      .eq('id', userTestId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit test',
        variant: 'destructive',
      });
    } else {
      navigate(`/results/${userTestId}`);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading test...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{test?.title}</h1>
            <p className="text-sm text-muted-foreground">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          {test && <TestTimer durationMinutes={test.duration_minutes} onTimeUp={handleSubmit} />}
        </div>

        <Progress value={progress} className="mb-6" />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{currentQuestion?.question_text}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={answers[currentQuestion?.id]?.toString() || ''}
              onValueChange={(value) => handleAnswerSelect(currentQuestion.id, parseInt(value))}
            >
              {currentQuestion?.shuffledOptions.map((option, displayIndex) => (
                <div key={displayIndex} className="flex items-center space-x-2 rounded-lg border p-4 hover:bg-accent transition-colors">
                  <RadioGroupItem value={option.originalIndex.toString()} id={`option-${displayIndex}`} />
                  <Label htmlFor={`option-${displayIndex}`} className="flex-1 cursor-pointer">
                    {option.text}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                disabled={!canGoPrev}
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              {canGoNext ? (
                <Button
                  onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSubmit}>
                  Submit Test
                  <Send className="ml-2 h-4 w-4" />
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