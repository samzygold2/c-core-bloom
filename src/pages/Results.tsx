import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, Trophy } from 'lucide-react';
import { format } from 'date-fns';

interface UserTest {
  id: string;
  score: number;
  start_time: string;
  end_time: string;
  tests: {
    title: string;
    total_questions: number;
  };
}

const Results = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<UserTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchResults();
  }, [user, authLoading, navigate]);

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const fetchResults = async () => {
    const { data, error } = await supabase
      .from('user_tests')
      .select(`
        id,
        score,
        start_time,
        end_time,
        tests (
          title,
          total_questions
        )
      `)
      .eq('user_id', user!.id)
      .not('score', 'is', null)
      .order('start_time', { ascending: false });

    if (!error && data) {
      setResults(data as any);
    }
    setLoading(false);
  };

  const getScoreVariant = (score: number, total: number): 'default' | 'secondary' | 'destructive' => {
    const percentage = (score / total) * 100;
    if (percentage >= 80) return 'default';
    if (percentage >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between p-3 sm:p-4">
          <h1 className="text-lg sm:text-2xl font-bold">My Test Results</h1>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6">
        {loading ? (
          <div className="grid gap-3 sm:gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-20 sm:h-24 bg-muted" />
              </Card>
            ))}
          </div>
        ) : results.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
              <Trophy className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-3 sm:mb-4" />
              <p className="text-base sm:text-lg text-muted-foreground">No test results yet</p>
              <Button onClick={() => navigate('/dashboard')} className="mt-3 sm:mt-4">
                Take a Test
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-4">
            {results.map((result) => {
              const percentage = ((result.score / result.tests.total_questions) * 100).toFixed(1);
              
              return (
                <Card key={result.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg mb-1 sm:mb-2 truncate">{result.tests.title}</CardTitle>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                            {format(new Date(result.start_time), 'MMM dd, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                            {format(new Date(result.start_time), 'HH:mm')}
                          </span>
                        </div>
                      </div>
                      <Badge variant={getScoreVariant(result.score, result.tests.total_questions)} className="self-start sm:self-center">
                        {percentage}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 pt-0">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                      <span className="text-sm sm:text-lg font-semibold">
                        {result.score} / {result.tests.total_questions}
                      </span>
                      <span className="text-xs sm:text-sm text-muted-foreground">correct answers</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Results;