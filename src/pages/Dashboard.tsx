import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, BookOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/DashboardLayout';

interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  total_questions: number;
  is_active: boolean;
}

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<{ is_pending: boolean; is_waiting: boolean } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchTests = useCallback(async () => {
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
  }, [toast]);

  const checkUserStatus = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_pending, is_waiting')
      .eq('id', user!.id)
      .single();

    if (!error && data) {
      setUserStatus(data);
      if (!data.is_pending && !data.is_waiting) {
        fetchTests();
      } else {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [user, fetchTests]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/auth');
      return;
    }
    checkUserStatus();
  }, [user, authLoading, navigate, checkUserStatus]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const startTest = (testId: string) => {
    navigate(`/test/${testId}`);
  };

  return (
    <DashboardLayout title="Available Tests" subtitle="Select a test to begin">
      {userStatus?.is_pending && (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Account Pending Approval</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Your account is awaiting approval from your assigned admin. You'll be able to access tests once approved.
            </p>
          </CardContent>
        </Card>
      )}

      {userStatus?.is_waiting && (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Awaiting Admin Assignment</h3>
            <p className="text-muted-foreground text-center max-w-md">
              You're waiting to be assigned to an admin. Please check back later.
            </p>
          </CardContent>
        </Card>
      )}

      {!userStatus?.is_pending && !userStatus?.is_waiting && (
        <>
          {loading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tests.map((test) => (
                <Card key={test.id} className="hover:shadow-lg transition-shadow flex flex-col">
                  <CardHeader className="pb-2 flex-1">
                    <CardTitle className="text-lg">{test.title}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {test.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
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
        </>
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
