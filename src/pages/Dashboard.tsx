import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, BookOpen, LogOut, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  total_questions: number;
  is_active: boolean;
}

const Dashboard = () => {
  const { user, isAdmin, signOut } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchTests();
  }, [user, navigate]);

  const fetchTests = async () => {
    const { data, error } = await supabase
      .from('tests')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tests',
        variant: 'destructive',
      });
    } else {
      setTests(data || []);
    }
    setLoading(false);
  };

  const startTest = (testId: string) => {
    navigate(`/test/${testId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold">CBT Platform</h1>
            <p className="text-sm text-muted-foreground">Welcome, {user?.email}</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => navigate('/admin')}>
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate('/results')}>
              My Results
            </Button>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-3xl font-bold">Available Tests</h2>
          <p className="text-muted-foreground">Select a test to begin</p>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32 bg-muted" />
              </Card>
            ))}
          </div>
        ) : tests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No active tests available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tests.map((test) => (
              <Card key={test.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>{test.title}</CardTitle>
                  <CardDescription className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {test.duration_minutes} minutes
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-4 w-4" />
                      {test.total_questions} questions
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge className="mb-3" variant="secondary">
                    {test.duration_minutes === 30 ? 'Short Test' : 'Full Test'}
                  </Badge>
                  <Button onClick={() => startTest(test.id)} className="w-full">
                    Start Test
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;