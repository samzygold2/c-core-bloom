import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, BookOpen, LogOut, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserSettingsDialog } from '@/components/UserSettingsDialog';

interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  total_questions: number;
  is_active: boolean;
}

const Dashboard = () => {
  const { user, isAdmin, signOut, loading: authLoading } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState<{ is_pending: boolean; is_waiting: boolean } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    checkUserStatus();
  }, [user, authLoading, navigate]);

  const checkUserStatus = async () => {
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
  };

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold">CBT Platform</h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-none">
              Welcome, {user?.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {isAdmin && (
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => navigate('/admin')}>
                <Shield className="mr-1 sm:mr-2 h-4 w-4" />
                <span className="hidden xs:inline">Admin</span>
                <span className="xs:hidden">Admin</span>
              </Button>
            )}
            <UserSettingsDialog />
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => navigate('/results')}>
              <span className="hidden sm:inline">My Results</span>
              <span className="sm:hidden">Results</span>
            </Button>
            <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={signOut}>
              <LogOut className="mr-1 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6">
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
            <div className="mb-4 sm:mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold">Available Tests</h2>
              <p className="text-sm sm:text-base text-muted-foreground">Select a test to begin</p>
            </div>

            {loading ? (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {tests.map((test) => (
                  <Card key={test.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg sm:text-xl">{test.title}</CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                          {test.duration_minutes} min
                        </span>
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3 sm:h-4 sm:w-4" />
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
      </main>
    </div>
  );
};

export default Dashboard;