import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, BookOpen, Trophy, TrendingUp, Activity, Clock, BarChart3, UserCheck, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { downloadTestResultPDF } from '@/lib/pdfGenerator';
import { useToast } from '@/hooks/use-toast';

interface Stats {
  totalUsers: number;
  totalTests: number;
  totalAttempts: number;
  averageScore: number;
  activeTests: number;
  completionRate: number;
  averageDuration: number;
}

interface TestPerformance {
  testTitle: string;
  attempts: number;
  averageScore: number;
  passRate: number;
}

interface RecentActivity {
  id: string;
  username: string;
  email: string;
  testTitle: string;
  score: number;
  totalQuestions: number;
  timestamp: string;
  startTime: string;
  endTime: string;
  answers: any;
}

export const AnalyticsDashboard = () => {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalTests: 0,
    totalAttempts: 0,
    averageScore: 0,
    activeTests: 0,
    completionRate: 0,
    averageDuration: 0,
  });
  const [testPerformance, setTestPerformance] = useState<TestPerformance[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    fetchStats();
    fetchTestPerformance();
    fetchRecentActivity();
  }, []);

  const fetchStats = async () => {
    const [usersRes, testsRes, activeTestsRes, attemptsRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('tests').select('id', { count: 'exact', head: true }),
      supabase.from('tests').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('user_tests').select('score, start_time, end_time').not('score', 'is', null),
    ]);

    const totalUsers = usersRes.count || 0;
    const totalTests = testsRes.count || 0;
    const activeTests = activeTestsRes.count || 0;
    const attempts = attemptsRes.data || [];
    const totalAttempts = attempts.length;
    
    const averageScore = totalAttempts > 0
      ? attempts.reduce((sum, a) => sum + (a.score || 0), 0) / totalAttempts
      : 0;

    // Calculate completion rate (attempts with scores vs total attempts)
    const { count: totalStarted } = await supabase
      .from('user_tests')
      .select('id', { count: 'exact', head: true });
    const completionRate = totalStarted ? (totalAttempts / totalStarted) * 100 : 0;

    // Calculate average duration
    const durationsInMinutes = attempts
      .filter(a => a.start_time && a.end_time)
      .map(a => {
        const start = new Date(a.start_time!).getTime();
        const end = new Date(a.end_time!).getTime();
        return (end - start) / 1000 / 60; // Convert to minutes
      });
    const averageDuration = durationsInMinutes.length > 0
      ? durationsInMinutes.reduce((sum, d) => sum + d, 0) / durationsInMinutes.length
      : 0;

    setStats({
      totalUsers,
      totalTests,
      totalAttempts,
      averageScore,
      activeTests,
      completionRate,
      averageDuration,
    });
  };

  const fetchTestPerformance = async () => {
    const { data: attempts } = await supabase
      .from('user_tests')
      .select('test_id, score, tests(title)')
      .not('score', 'is', null);

    if (!attempts) return;

    // Group by test
    const testMap = new Map<string, { scores: number[]; title: string }>();
    attempts.forEach((attempt: any) => {
      const testId = attempt.test_id;
      const title = attempt.tests?.title || 'Unknown Test';
      if (!testMap.has(testId)) {
        testMap.set(testId, { scores: [], title });
      }
      testMap.get(testId)?.scores.push(attempt.score);
    });

    // Calculate performance metrics
    const performance: TestPerformance[] = Array.from(testMap.entries()).map(([_, data]) => {
      const avgScore = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;
      const passRate = (data.scores.filter(s => s >= 50).length / data.scores.length) * 100;
      return {
        testTitle: data.title,
        attempts: data.scores.length,
        averageScore: avgScore,
        passRate,
      };
    });

    setTestPerformance(performance.sort((a, b) => b.attempts - a.attempts).slice(0, 5));
  };

  const fetchRecentActivity = async () => {
    const { data } = await supabase
      .from('user_tests')
      .select(`
        id,
        score,
        start_time,
        end_time,
        answers,
        created_at,
        tests(title, total_questions),
        profiles(firstname, lastname, email)
      `)
      .not('score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!data) return;

    const activity: RecentActivity[] = data.map((item: any) => ({
      id: item.id,
      username: item.profiles ? `${item.profiles.firstname} ${item.profiles.lastname}` : 'Unknown User',
      email: item.profiles?.email || '',
      testTitle: item.tests?.title || 'Unknown Test',
      score: item.score,
      totalQuestions: item.tests?.total_questions || 0,
      timestamp: new Date(item.created_at).toLocaleString(),
      startTime: item.start_time,
      endTime: item.end_time,
      answers: item.answers,
    }));

    setRecentActivity(activity);
  };

  const handleDownloadPDF = (activity: RecentActivity) => {
    try {
      downloadTestResultPDF({
        studentName: activity.username,
        email: activity.email,
        testTitle: activity.testTitle,
        score: activity.score,
        totalQuestions: activity.totalQuestions,
        startTime: activity.startTime,
        endTime: activity.endTime,
        answers: activity.answers,
      });
      
      toast({
        title: 'PDF Downloaded',
        description: `Test result PDF for ${activity.username} downloaded successfully`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate PDF',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Performance Analytics</h2>
        <p className="text-muted-foreground">Monitor system performance and user activity</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tests</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeTests}</div>
            <p className="text-xs text-muted-foreground mt-1">of {stats.totalTests} total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Test Attempts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAttempts}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.completionRate.toFixed(1)}% completion rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageScore.toFixed(1)}</div>
            <Progress value={stats.averageScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageDuration.toFixed(0)}m</div>
            <p className="text-xs text-muted-foreground mt-1">Per test attempt</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Online</div>
            <p className="text-xs text-muted-foreground mt-1">All systems operational</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <CardTitle>Test Performance</CardTitle>
            </div>
            <CardDescription>Top 5 tests by attempt volume</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No test data available yet</p>
            ) : (
              testPerformance.map((test, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{test.testTitle}</span>
                    <span className="text-muted-foreground">{test.attempts} attempts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Avg Score: </span>
                      <span className="font-medium">{test.averageScore.toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pass Rate: </span>
                      <span className="font-medium">{test.passRate.toFixed(1)}%</span>
                    </div>
                  </div>
                  <Progress value={test.averageScore} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <CardTitle>Recent Activity</CardTitle>
            </div>
            <CardDescription>Latest test completions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            ) : (
              recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between border-b pb-2 last:border-0 gap-2">
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium">{activity.username}</p>
                    <p className="text-xs text-muted-foreground">{activity.testTitle}</p>
                    <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-lg font-bold ${activity.score >= 50 ? 'text-green-500' : 'text-destructive'}`}>
                      {activity.score}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadPDF(activity)}
                      title="Download PDF"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};