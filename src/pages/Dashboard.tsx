import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Hourglass, ListOrdered, ClipboardX, Play, UserRoundSearch } from 'lucide-react';
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
        title: 'Could not load your tests',
        description: 'Check your connection and refresh the page.',
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
    <DashboardLayout title="My tests" subtitle="Tests your tutor has opened for you">
      {userStatus?.is_pending && (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Hourglass className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-center">Waiting for your tutor to approve you</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Your tests will appear here as soon as your tutor accepts your account. Nothing else to do for now.
            </p>
          </CardContent>
        </Card>
      )}

      {userStatus?.is_waiting && (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserRoundSearch className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-center">You don't have a tutor yet</h3>
            <p className="text-muted-foreground text-center max-w-md">
              An admin still needs to link your account to a tutor. Check back later.
            </p>
          </CardContent>
        </Card>
      )}

      {!userStatus?.is_pending && !userStatus?.is_waiting && (
        <>
          {loading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="h-32 bg-muted" />
                </Card>
              ))}
            </div>
          ) : tests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ClipboardX className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold">No tests open right now</p>
                <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                  When your tutor publishes a test it shows up here. Meanwhile you can practise JAMB past questions.
                </p>
                <Button variant="outline" onClick={() => navigate('/jamb')} className="mt-4 h-11 sm:h-10">
                  Practise past questions
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {tests.map((test) => (
                <Card key={test.id} className="hover:shadow-lg transition-shadow flex flex-col">
                  <CardHeader className="pb-3 flex-1 space-y-2">
                    <Badge className="w-fit" variant="secondary">
                      {test.duration_minutes === 30 ? 'Short test' : 'Full test'}
                    </Badge>
                    <CardTitle className="text-lg leading-snug break-words">{test.title}</CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {test.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1">
                        <ListOrdered className="h-3.5 w-3.5" />
                        {test.total_questions} questions
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => startTest(test.id)} className="h-11 w-full sm:h-10">
                      <Play className="mr-2 h-4 w-4" />
                      Start test
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
