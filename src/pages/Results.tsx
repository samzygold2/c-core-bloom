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

  const getScoreColor = (score: number, total: number) => {
    const percentage = (score / total) * 100;
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold">My Test Results</h1>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-6">
        {loading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-24 bg-muted" />
              </Card>
            ))}
          </div>
        ) : results.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No test results yet</p>
              <Button onClick={() => navigate('/dashboard')} className="mt-4">
                Take a Test
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {results.map((result) => {
              const percentage = ((result.score / result.tests.total_questions) * 100).toFixed(1);
              
              return (
                <Card key={result.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="mb-2">{result.tests.title}</CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(result.start_time), 'MMM dd, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {format(new Date(result.start_time), 'HH:mm')}
                          </span>
                        </div>
                      </div>
                      <Badge className={getScoreColor(result.score, result.tests.total_questions)}>
                        {percentage}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-muted-foreground" />
                      <span className="text-lg font-semibold">
                        {result.score} / {result.tests.total_questions}
                      </span>
                      <span className="text-muted-foreground">correct answers</span>
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