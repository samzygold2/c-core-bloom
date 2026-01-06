import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trophy, Target } from 'lucide-react';

interface UserTest {
  id: string;
  score: number;
  tests: {
    title: string;
    total_questions: number;
  };
}

const ResultDetail = () => {
  const { resultId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<UserTest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    
    if (!user || !resultId) {
      navigate('/auth');
      return;
    }
    
    fetchResult();
  }, [user, resultId, authLoading, navigate]);

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const fetchResult = async () => {
    const { data, error } = await supabase
      .from('user_tests')
      .select(`
        id,
        score,
        tests (
          title,
          total_questions
        )
      `)
      .eq('id', resultId)
      .eq('user_id', user!.id)
      .single();

    if (!error && data) {
      setResult(data as any);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card>
          <CardContent className="p-6">
            <p>Result not found</p>
            <Button onClick={() => navigate('/results')} className="mt-4">
              Back to Results
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const percentage = ((result.score / result.tests.total_questions) * 100).toFixed(1);
  const passed = parseFloat(percentage) >= 60;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between p-3 sm:p-4">
          <h1 className="text-lg sm:text-2xl font-bold">Test Results</h1>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl p-4 sm:p-6">
        <Card className="text-center">
          <CardHeader className="p-4 sm:p-6">
            <div className="mx-auto mb-3 sm:mb-4">
              {passed ? (
                <div className="rounded-full bg-green-500/10 p-4 sm:p-6 w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center mx-auto">
                  <Trophy className="h-8 w-8 sm:h-12 sm:w-12 text-green-500" />
                </div>
              ) : (
                <div className="rounded-full bg-yellow-500/10 p-4 sm:p-6 w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center mx-auto">
                  <Target className="h-8 w-8 sm:h-12 sm:w-12 text-yellow-500" />
                </div>
              )}
            </div>
            <CardTitle className="text-xl sm:text-3xl mb-2">{result.tests.title}</CardTitle>
            <Badge className={passed ? 'bg-green-500' : 'bg-yellow-500'} variant="secondary">
              {passed ? 'Passed' : 'Keep Practicing'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
            <div>
              <div className="text-4xl sm:text-6xl font-bold mb-1 sm:mb-2">{percentage}%</div>
              <p className="text-sm sm:text-base text-muted-foreground">Your Score</p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-4 text-left">
              <div className="rounded-lg border p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-green-500">{result.score}</div>
                <p className="text-xs sm:text-sm text-muted-foreground">Correct Answers</p>
              </div>
              <div className="rounded-lg border p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-red-500">
                  {result.tests.total_questions - result.score}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">Incorrect Answers</p>
              </div>
            </div>

            <div className="pt-3 sm:pt-4 space-y-2">
              <Button onClick={() => navigate('/dashboard')} className="w-full">
                Take Another Test
              </Button>
              <Button onClick={() => navigate('/results')} variant="outline" className="w-full">
                View All Results
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ResultDetail;