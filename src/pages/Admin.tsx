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
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats>({
    assignedUsers: 0,
    activeTests: 0,
    totalQuestions: 0,
    completedExams: 0,
  });

  useEffect(() => {
    // Wait for auth to finish loading before redirecting
    if (authLoading) return;
    
    if (!user) {
      navigate('/auth');
      return;
    }
    
    if (!isAdmin) {
      navigate('/dashboard');
    }
  }, [user, isAdmin, authLoading, navigate]);

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

  if (authLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Manage your assigned students, exams, and questions</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-6">
        {/* Admin Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <UserCheck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.assignedUsers}</p>
                  <p className="text-xs text-muted-foreground">My Students</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.activeTests}</p>
                  <p className="text-xs text-muted-foreground">Active Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <HelpCircle className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.totalQuestions}</p>
                  <p className="text-xs text-muted-foreground">Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completedExams}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="my-users" className="space-y-6">
          <TabsList className="bg-card border shadow-sm">
            <TabsTrigger value="my-users" className="gap-2">
              <UserCheck className="h-4 w-4" />
              My Students
            </TabsTrigger>
            <TabsTrigger value="tests" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Tests
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-2">
              <HelpCircle className="h-4 w-4" />
              Questions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              My Analytics
            </TabsTrigger>
            <TabsTrigger value="password-reset" className="gap-2">
              <KeyRound className="h-4 w-4" />
              Password Reset
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
