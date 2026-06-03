import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, BookOpen, HelpCircle, BarChart3, UserCheck, FileText, KeyRound, Inbox } from 'lucide-react';
import { TestManager } from '@/components/admin/TestManager';
import { QuestionManager } from '@/components/admin/QuestionManager';
import { AnalyticsDashboard } from '@/components/admin/AnalyticsDashboard';
import { AssignedUsersManager } from '@/components/admin/AssignedUsersManager';
import PasswordResetManager from '@/components/admin/PasswordResetManager';
import { SubmittedTestsManager } from '@/components/admin/SubmittedTestsManager';
import { DashboardLayout } from '@/components/DashboardLayout';

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
    if (authLoading || adminLoading) return;
    if (!user) { navigate('/auth'); return; }
    if (!isAdmin) { navigate('/dashboard'); }
  }, [user, isAdmin, authLoading, adminLoading, navigate]);

  useEffect(() => {
    if (user && isAdmin) { fetchAdminStats(); }
  }, [user, isAdmin]);

  const fetchAdminStats = async () => {
    if (!user) return;
    // Get assigned user IDs first, then count their completed exams
    const [assignedRes, activeTestsRes, questionsRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('assigned_admin_id', user.id).eq('is_waiting', false),
      supabase.from('tests').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('created_by', user.id),
      supabase.from('questions').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
    ]);

    // Fetch assigned user IDs to count completed exams
    let completedCount = 0;
    const { data: assignedProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('assigned_admin_id', user.id)
      .eq('is_waiting', false);
    
    if (assignedProfiles && assignedProfiles.length > 0) {
      const userIds = assignedProfiles.map(p => p.id);
      const { count } = await supabase
        .from('user_tests')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds)
        .not('score', 'is', null);
      completedCount = count || 0;
    }

    setStats({
      assignedUsers: assignedRes.count || 0,
      activeTests: activeTestsRes.count || 0,
      totalQuestions: questionsRes.count || 0,
      completedExams: completedCount,
    });
  };

  if (authLoading || adminLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const statCards = [
    { icon: UserCheck, label: 'My Students', value: stats.assignedUsers },
    { icon: BookOpen, label: 'Active Tests', value: stats.activeTests },
    { icon: HelpCircle, label: 'Questions', value: stats.totalQuestions },
    { icon: FileText, label: 'Completed', value: stats.completedExams },
  ];

  return (
    <DashboardLayout title="Admin Panel" subtitle="Manage students, exams, and questions">
      <div className="space-y-4 sm:space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map(({ icon: Icon, label, value }) => (
            <Card key={label}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg sm:text-2xl font-bold">{value}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="my-users" className="space-y-4">
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
            <TabsTrigger value="submitted" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <Inbox className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Submitted Tests</span>
              <span className="sm:hidden">Submitted</span>
            </TabsTrigger>
            <TabsTrigger value="password-reset" className="gap-1 sm:gap-2 text-xs sm:text-sm flex-1 sm:flex-none">
              <KeyRound className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Password Reset</span>
              <span className="sm:hidden">Reset</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="my-users"><AssignedUsersManager /></TabsContent>
          <TabsContent value="tests"><TestManager /></TabsContent>
          <TabsContent value="questions"><QuestionManager /></TabsContent>
          <TabsContent value="analytics"><AnalyticsDashboard /></TabsContent>
          <TabsContent value="submitted"><SubmittedTestsManager /></TabsContent>
          <TabsContent value="password-reset"><PasswordResetManager /></TabsContent>

          <TabsContent value="my-users"><AssignedUsersManager /></TabsContent>
          <TabsContent value="tests"><TestManager /></TabsContent>
          <TabsContent value="questions"><QuestionManager /></TabsContent>
          <TabsContent value="analytics"><AnalyticsDashboard /></TabsContent>
          <TabsContent value="password-reset"><PasswordResetManager /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Admin;
