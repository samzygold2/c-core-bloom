import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, BookOpen, Trophy, TrendingUp } from 'lucide-react';

interface Stats {
  totalUsers: number;
  totalTests: number;
  totalAttempts: number;
  averageScore: number;
}

export const AnalyticsDashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalTests: 0,
    totalAttempts: 0,
    averageScore: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    const [usersRes, testsRes, attemptsRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('tests').select('id', { count: 'exact', head: true }),
      supabase.from('user_tests').select('score').not('score', 'is', null),
    ]);

    const totalUsers = usersRes.count || 0;
    const totalTests = testsRes.count || 0;
    const attempts = attemptsRes.data || [];
    const totalAttempts = attempts.length;
    
    const averageScore = totalAttempts > 0
      ? attempts.reduce((sum, a) => sum + (a.score || 0), 0) / totalAttempts
      : 0;

    setStats({
      totalUsers,
      totalTests,
      totalAttempts,
      averageScore,
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics Overview</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Test Attempts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAttempts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageScore.toFixed(1)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};