import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Users, BookOpen, HelpCircle, BarChart3, UserCheck, FileText, Clock, KeyRound } from 'lucide-react';
import { TestManager } from '@/components/admin/TestManager';
import { QuestionManager } from '@/components/admin/QuestionManager';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { AssignedUsersManager } from '@/components/admin/AssignedUsersManager';
import PasswordResetManager from '@/components/admin/PasswordResetManager';

interface AdminStats {
  assignedUsers: number;
  activeTests: number;
  totalQuestions: number;
  completedExams: number;
}

const Admin = () => {
  const { user, isAdmin, loading: authLoading, adminLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats>({
    assignedUsers: 0,
    activeTests: 0,
    totalQuestions: 0,
    completedExams: 0,
  });

  useEffect(() => {
    // Wait for both auth and admin role check to finish before redirecting
    if (authLoading || adminLoading) return;
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    if (!isAdmin) {
      navigate('/dashboard');
    }
  }, [user, isAdmin, authLoading, adminLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchAdminStats();
    }
  }, [user, isAdmin]);

  const fetchAdminStats = async () => {
    if (!user) return;

    const [assignedRes, activeTestsRes, questionsRes, completedRes] = await Promise.all([
      // Count users assigned to this admin
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_admin_id', user.id)
        .eq('is_waiting', false),
      // Count active tests
      supabase
        .from('tests')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      // Count total questions
      supabase
        .from('questions')
        .select('id', { count: 'exact', head: true }),
      // Count completed exams by assigned users
      supabase
        .from('user_tests')
        .select('id, profiles!inner(assigned_admin_id)', { count: 'exact', head: true })
        .eq('profiles.assigned_admin_id', user.id)
        .not('score', 'is', null),
    ]);

    setStats({
      assignedUsers: assignedRes.count || 0,
      activeTests: activeTestsRes.count || 0,
      totalQuestions: questionsRes.count || 0,
      completedExams: completedRes.count || 0,
    });
  };

  if (authLoading || adminLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">Admin Panel</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Manage students, exams, and questions</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-1 sm:mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Admin Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                  <UserCheck className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{stats.assignedUsers}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">My Students</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                  <BookOpen className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{stats.activeTests}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Active Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                  <HelpCircle className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{stats.totalQuestions}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg sm:text-2xl font-bold">{stats.completedExams}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="my-users" className="space-y-4 sm:space-y-6">
          <TabsList className="bg-card border shadow-sm w-full flex-wrap h-auto p-1 gap-1">
            <TabsTrigger value="my-users" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <UserCheck className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">My Students</span>
              <span className="sm:hidden">Students</span>
            </TabsTrigger>
            <TabsTrigger value="tests" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <BookOpen className="h-3 w-3 sm:h-4 sm:w-4" />
              Tests
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <HelpCircle className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Questions</span>
              <span className="sm:hidden">Q&A</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">My Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="password-reset" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <KeyRound className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Password Reset</span>
              <span className="sm:hidden">Reset</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-users">
            <AssignedUsersManager />
          </TabsContent>

          <TabsContent value="tests">
            <TestManager />
          </TabsContent>

          <TabsContent value="questions">
            <QuestionManager />
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsDashboard />
          </TabsContent>

          <TabsContent value="password-reset">
            <PasswordResetManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
