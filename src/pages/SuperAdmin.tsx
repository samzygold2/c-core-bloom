import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  Users, 
  Activity, 
  CheckCircle, 
  Clock, 
  Search,
  RefreshCw,
  LogOut,
  Database,
  FileText,
  UserCog,
  KeyRound,
  Settings,
  BarChart3,
  BookOpen,
  AlertTriangle,
  Download,
  GraduationCap,
  Loader2
} from 'lucide-react';
import { downloadBulkTestResultsPDF } from '@/lib/pdfGenerator';
import SystemConfigPanel from '@/components/admin/SystemConfigPanel';
import AdminPasswordResetManager from '@/components/admin/AdminPasswordResetManager';
import AdminActivityMonitor from '@/components/admin/AdminActivityMonitor';
import { SuperAdminJambSync } from '@/components/admin/SuperAdminJambSync';

interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  timestamp: string;
  admin_email?: string;
}

interface SystemLog {
  id: string;
  log_level: string;
  message: string;
  source: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface UserWithRoles {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  created_at: string;
  roles: string[];
}

interface TestResult {
  id: string;
  username: string;
  email: string;
  testTitle: string;
  score: number;
  totalQuestions: number;
  timestamp: string;
  startTime: string;
  endTime: string;
  answers: Record<string, unknown> | null;
}

interface SystemStats {
  totalUsers: number;
  totalAdmins: number;
  totalTests: number;
  totalQuestions: number;
  totalJambQuestions: number;
  activeJambQuestions: number;
  activeTests: number;
  completedTests: number;
  averageScore: number;
}

const SuperAdmin = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [allResults, setAllResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    totalAdmins: 0,
    totalTests: 0,
    totalQuestions: 0,
    totalJambQuestions: 0,
    activeJambQuestions: 0,
    activeTests: 0,
    completedTests: 0,
    averageScore: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [jambActive, setJambActive] = useState<boolean>(false);
  const [jambStatsLoading, setJambStatsLoading] = useState<boolean>(false);

  const fetchJambStatus = async () => {
    try {
      const [{ count: activeCount }, { count: totalCount }] = await Promise.all([
        supabase.from('question_visibility').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('past_questions').select('*', { count: 'exact', head: true }),
      ]);
      
      setJambActive(activeCount ? activeCount > 0 : false);
      setStats(prev => ({
        ...prev,
        totalJambQuestions: totalCount || 0,
        activeJambQuestions: activeCount || 0,
      }));
    } catch (error) {
      console.error('Error fetching JAMB status:', error);
    }
  };

  useEffect(() => {
    const handleSync = () => {
      fetchJambStatus();
      fetchStats();
    };
    window.addEventListener('jamb-questions-approved', handleSync);

    // Live realtime updates with database
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchJambStatus();
        fetchStats();
      }, 500);
    };

    const channel = supabase
      .channel('super_admin_live_stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'past_questions' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_visibility' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tests' }, debouncedRefresh)
      .subscribe();

    return () => {
      window.removeEventListener('jamb-questions-approved', handleSync);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleJambToggle = async (checked: boolean) => {
    setJambStatsLoading(true);
    try {
      if (checked) {
        // Fast RPC approval across all admins
        const { data, error } = await supabase.rpc('approve_all_jamb_questions', {
          target_admin_id: null,
          specific_year: null,
          specific_subject: null,
        });

        if (!error && data) {
          const resp = data as unknown as {
            questions_approved: number;
            admins_affected: number;
            message?: string;
          };
          setJambActive(true);
          toast({
            title: '🌟 JAMB Questions Approved & Broadcasted',
            description: resp.message || `Successfully approved ${resp.questions_approved} questions across ${resp.admins_affected} admin(s)!`,
          });
          window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
          return;
        }

        // Fallback if RPC is not present
        let pqs: { id: string }[] = [];
        let fromPq = 0;
        const batchSize = 5000;
        while (true) {
          const { data: pqData, error: fetchErr } = await supabase
            .from('past_questions')
            .select('id')
            .range(fromPq, fromPq + batchSize - 1);
          
          if (fetchErr) throw fetchErr;
          if (!pqData || pqData.length === 0) break;
          pqs = [...pqs, ...pqData];
          if (pqData.length < batchSize) break;
          fromPq += batchSize;
        }

        const { data: roles, error: rolesErr } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['admin', 'super_admin']);

        if (rolesErr) throw rolesErr;

        if (pqs && pqs.length > 0 && roles && roles.length > 0) {
          const adminIds = Array.from(new Set(roles.map(r => r.user_id)));
          const rows = [];
          for (const pq of pqs) {
            for (const adminId of adminIds) {
              rows.push({
                question_id: pq.id,
                admin_id: adminId,
                is_active: true,
                activated_at: new Date().toISOString(),
              });
            }
          }

          for (let i = 0; i < rows.length; i += 5000) {
            const chunk = rows.slice(i, i + 5000);
            const { error: upsertErr } = await supabase
              .from('question_visibility')
              .upsert(chunk, { onConflict: 'question_id,admin_id' });

            if (upsertErr) throw upsertErr;
          }
        }
        setJambActive(true);
        toast({
          title: 'JAMB Questions Activated',
          description: 'All JAMB questions have been successfully activated and approved for all admins and students!',
        });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
      } else {
        // Deactivate all questions by setting is_active to false
        const { error: updateErr } = await supabase
          .from('question_visibility')
          .update({ is_active: false })
          .eq('is_active', true);

        if (updateErr) throw updateErr;

        setJambActive(false);
        toast({
          title: 'JAMB Questions Deactivated',
          description: 'All JAMB questions have been deactivated across the system.',
        });
        window.dispatchEvent(new CustomEvent('jamb-questions-approved'));
      }
    } catch (error: unknown) {
      console.error('Error toggling JAMB questions:', error);
      const errMsg = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Error',
        description: `Failed to update JAMB questions: ${errMsg}`,
        variant: 'destructive',
      });
    } finally {
      setJambStatsLoading(false);
    }
  };

  useEffect(() => {
    checkSuperAdminAccess();
  }, []);

  const checkSuperAdminAccess = async () => {
    // First wait for any session to be restored
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate('/super-admin-login');
      return;
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (roleError) {
      console.error('Role check error:', roleError);
    }

    if (!roleData) {
      toast({
        title: 'Access Denied',
        description: 'You do not have super admin privileges.',
        variant: 'destructive',
      });
      navigate('/');
      return;
    }

    setIsSuperAdmin(true);
    setLoading(false);
    fetchAllData();
  };

  const fetchAllData = async () => {
    await Promise.all([
      fetchAuditLogs(),
      fetchSystemLogs(),
      fetchUsers(),
      fetchStats(),
      fetchAllResults(),
      fetchJambStatus(),
    ]);
  };

  const fetchAuditLogs = async () => {
    const { data: logs, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching audit logs:', error);
      return;
    }

    const logsWithEmails = await Promise.all(
      (logs || []).map(async (log) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', log.admin_id)
          .single();
        return {
          ...log,
          admin_email: profile?.email || 'Unknown',
        };
      })
    );

    setAuditLogs(logsWithEmails);
  };

  const fetchSystemLogs = async () => {
    const { data: logs, error } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching system logs:', error);
      return;
    }

    setSystemLogs((logs || []) as unknown as SystemLog[]);
  };

  const fetchUsers = async () => {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    const usersWithRoles = await Promise.all(
      (profiles || []).map(async (profile) => {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.id);
        return {
          ...profile,
          roles: roles?.map((r) => r.role) || [],
        };
      })
    );

    setUsers(usersWithRoles);
  };

  const fetchStats = async () => {
    const [
      { count: totalUsers },
      { data: adminRoles },
      { count: totalTests },
      { count: totalQuestions },
      { count: totalJambQuestions },
      { count: activeJambQuestions },
      { count: activeTests },
      { data: completedAttempts },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('user_roles').select('*').eq('role', 'admin'),
      supabase.from('tests').select('*', { count: 'exact', head: true }),
      supabase.from('questions').select('*', { count: 'exact', head: true }),
      supabase.from('past_questions').select('*', { count: 'exact', head: true }),
      supabase.from('question_visibility').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('tests').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('user_tests').select('score').not('score', 'is', null),
    ]);

    const averageScore = completedAttempts && completedAttempts.length > 0
      ? completedAttempts.reduce((sum, a) => sum + (a.score || 0), 0) / completedAttempts.length
      : 0;

    setStats({
      totalUsers: totalUsers || 0,
      totalAdmins: adminRoles?.length || 0,
      totalTests: totalTests || 0,
      totalQuestions: totalQuestions || 0,
      totalJambQuestions: totalJambQuestions || 0,
      activeJambQuestions: activeJambQuestions || 0,
      activeTests: activeTests || 0,
      completedTests: completedAttempts?.length || 0,
      averageScore,
    });
  };

  const fetchAllResults = async () => {
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
      .order('created_at', { ascending: false });

    if (!data) return;

    interface RawTestResult {
      id: string;
      score: number;
      start_time: string;
      end_time: string;
      answers: Record<string, unknown> | null;
      created_at: string;
      tests: { title: string; total_questions: number } | null;
      profiles: { firstname: string; lastname: string; email: string } | null;
    }

    const results: TestResult[] = (data as unknown as RawTestResult[]).map((item) => ({
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

    setAllResults(results);
  };

  const handleAssignRole = async (userId: string, role: 'admin' | 'super_admin' | 'user') => {
    const { error } = await supabase.functions.invoke('assign-admin-role', {
      body: { userId, role }
    });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign role.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Role Assigned',
      description: `Successfully assigned ${role} role.`,
    });
    fetchUsers();
    fetchAuditLogs();
  };

  const handleRemoveRole = async (userId: string, role: 'admin' | 'super_admin' | 'user') => {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', role);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove role.',
        variant: 'destructive',
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('audit_log').insert({
        admin_id: user.id,
        action: `Removed ${role} role from user ${userId}`,
      });
    }

    toast({
      title: 'Role Removed',
      description: `Successfully removed ${role} role.`,
    });
    fetchUsers();
    fetchAuditLogs();
  };

  const handlePasswordRecovery = async (userEmail: string, userName: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to send password recovery email.',
        variant: 'destructive',
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('audit_log').insert({
        admin_id: user.id,
        action: `Sent password recovery email to ${userName} (${userEmail})`,
      });
    }

    toast({
      title: 'Password Recovery Sent',
      description: `Password recovery email sent to ${userEmail}.`,
    });
    fetchAuditLogs();
  };

  const handleDownloadAllResults = async () => {
    if (allResults.length === 0) {
      toast({
        title: 'No Results',
        description: 'No test results available to download',
        variant: 'destructive',
      });
      return;
    }

    setDownloadingAll(true);
    try {
      downloadBulkTestResultsPDF(
        allResults.map(r => ({
          studentName: r.username,
          email: r.email,
          testTitle: r.testTitle,
          score: r.score,
          totalQuestions: r.totalQuestions,
          startTime: r.startTime,
          endTime: r.endTime,
          answers: r.answers,
        }))
      );
      
      toast({
        title: 'Report Downloaded',
        description: `Complete report with ${allResults.length} results downloaded`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate report',
        variant: 'destructive',
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/super-admin-login');
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastname.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' || user.roles.includes(roleFilter);
    
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-blue-700 text-white';
      case 'admin':
        return 'bg-blue-500 text-white';
      case 'user':
        return 'bg-slate-500 text-white';
      default:
        return 'bg-slate-400 text-white';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50';
      case 'warn':
        return 'text-amber-600 bg-amber-50';
      case 'info':
        return 'text-blue-600 bg-blue-50';
      default:
        return 'text-slate-600 bg-slate-50';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-blue-600 text-xl">Loading...</div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-white">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 backdrop-blur sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Super Admin Dashboard</h1>
              <p className="text-sm text-slate-500">Global System Control & Monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-blue-100 px-3 py-1.5 rounded-full shadow-inner text-xs sm:text-sm font-medium text-slate-700 mr-1 sm:mr-2">
              <span className="shrink-0">JAMB Questions:</span>
              {jambStatsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              ) : (
                <Switch
                  id="super-jamb-master-toggle"
                  checked={jambActive}
                  onCheckedChange={handleJambToggle}
                  disabled={jambStatsLoading}
                />
              )}
              <span className={jambActive ? "text-green-600 font-bold shrink-0" : "text-slate-500 shrink-0"}>
                {jambActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllData}
              className="border-blue-300 text-blue-600 hover:bg-blue-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4 mb-8">
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <Users className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.totalUsers}</p>
                  <p className="text-xs text-slate-500 truncate">Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <UserCog className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.totalAdmins}</p>
                  <p className="text-xs text-slate-500 truncate">Admins</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.totalTests}</p>
                  <p className="text-xs text-slate-500 truncate">Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <Database className="h-6 w-6 sm:h-8 sm:w-8 text-sky-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.totalQuestions}</p>
                  <p className="text-xs text-slate-500 truncate">Custom Qs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-200 ring-1 ring-blue-500/20 shadow-sm bg-gradient-to-br from-blue-50/50 to-white">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <GraduationCap className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-indigo-950 truncate">{stats.totalJambQuestions.toLocaleString()}</p>
                  <div className="flex items-center gap-1 text-[11px] text-indigo-700 truncate">
                    <span className="font-semibold">JAMB DB</span>
                    {stats.activeJambQuestions > 0 && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded">Live</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.activeTests}</p>
                  <p className="text-xs text-slate-500 truncate">Active Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.completedTests}</p>
                  <p className="text-xs text-slate-500 truncate">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white border-blue-100 shadow-sm">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-slate-800 truncate">{stats.averageScore.toFixed(0)}%</p>
                  <p className="text-xs text-slate-500 truncate">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-white border border-blue-200 shadow-sm w-full max-w-full overflow-x-auto flex justify-start h-auto">


            <TabsTrigger value="users" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Users className="h-4 w-4 mr-2" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4 mr-2" />
              Global Reports
            </TabsTrigger>
            <TabsTrigger value="admin-activity" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <UserCog className="h-4 w-4 mr-2" />
              Admin Activity
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Activity className="h-4 w-4 mr-2" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="system" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <AlertTriangle className="h-4 w-4 mr-2" />
              System Logs
            </TabsTrigger>
            <TabsTrigger value="config" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Settings className="h-4 w-4 mr-2" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="admin-otp" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <KeyRound className="h-4 w-4 mr-2" />
              Admin OTP
            </TabsTrigger>
            <TabsTrigger value="jamb" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <GraduationCap className="h-4 w-4 mr-2" />
              JAMB Sync
            </TabsTrigger>
          </TabsList>


          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-white border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-800">User & Role Management</CardTitle>
                <CardDescription className="text-slate-500">
                  Full control over all users and their permissions across the platform
                </CardDescription>
                <div className="flex gap-4 mt-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-white border-blue-200 text-slate-800"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-40 bg-white border-blue-200 text-slate-800">
                      <SelectValue placeholder="Filter by role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="user">Users</SelectItem>
                      <SelectItem value="admin">Admins</SelectItem>
                      <SelectItem value="super_admin">Super Admins</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead className="text-slate-600">User</TableHead>
                        <TableHead className="text-slate-600">Email</TableHead>
                        <TableHead className="text-slate-600">Roles</TableHead>
                        <TableHead className="text-slate-600">Joined</TableHead>
                        <TableHead className="text-slate-600">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="text-slate-800 font-medium">
                            {user.firstname} {user.lastname}
                          </TableCell>
                          <TableCell className="text-slate-600">{user.email}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {user.roles.map((role) => (
                                <Badge key={role} className={getRoleBadgeColor(role)}>
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePasswordRecovery(user.email, `${user.firstname} ${user.lastname}`)}
                                className="border-amber-400 text-amber-600 hover:bg-amber-50 text-xs"
                              >
                                <KeyRound className="h-3 w-3 mr-1" />
                                Reset
                              </Button>
                              {!user.roles.includes('admin') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAssignRole(user.id, 'admin')}
                                  className="border-blue-400 text-blue-600 hover:bg-blue-50 text-xs"
                                >
                                  + Admin
                                </Button>
                              )}
                              {user.roles.includes('admin') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveRole(user.id, 'admin')}
                                  className="border-red-400 text-red-500 hover:bg-red-50 text-xs"
                                >
                                  - Admin
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports">
            <Card className="bg-white border-blue-100 shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-slate-800">Global Test Results</CardTitle>
                    <CardDescription className="text-slate-500">
                      View and export all test results across the platform
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={handleDownloadAllResults}
                    disabled={downloadingAll || allResults.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadingAll ? 'Generating...' : `Export All (${allResults.length})`}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead className="text-slate-600">Student</TableHead>
                        <TableHead className="text-slate-600">Test</TableHead>
                        <TableHead className="text-slate-600">Score</TableHead>
                        <TableHead className="text-slate-600">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allResults.slice(0, 20).map((result) => (
                        <TableRow key={result.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-800">{result.username}</p>
                              <p className="text-xs text-slate-500">{result.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-700">{result.testTitle}</TableCell>
                          <TableCell>
                            <span className={`font-bold ${result.score >= 50 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {result.score}/{result.totalQuestions}
                            </span>
                          </TableCell>
                          <TableCell className="text-slate-500">{result.timestamp}</TableCell>
                        </TableRow>
                      ))}
                      {allResults.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                            No test results found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {allResults.length > 20 && (
                  <p className="text-sm text-slate-500 mt-4 text-center">
                    Showing 20 of {allResults.length} results. Export to see all.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin Activity Tab */}
          <TabsContent value="admin-activity">
            <AdminActivityMonitor />
          </TabsContent>

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <Card className="bg-white border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-800">Audit Logs</CardTitle>
                <CardDescription className="text-slate-500">
                  Track all administrative actions across the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead className="text-slate-600">Timestamp</TableHead>
                        <TableHead className="text-slate-600">Admin</TableHead>
                        <TableHead className="text-slate-600">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="text-slate-500">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-400" />
                              {new Date(log.timestamp).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-700">{log.admin_email}</TableCell>
                          <TableCell className="text-slate-600">{log.action}</TableCell>
                        </TableRow>
                      ))}
                      {auditLogs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                            No audit logs found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Logs Tab */}
          <TabsContent value="system">
            <Card className="bg-white border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle className="text-slate-800">System Logs</CardTitle>
                <CardDescription className="text-slate-500">
                  Monitor system events, errors, and warnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead className="text-slate-600">Timestamp</TableHead>
                        <TableHead className="text-slate-600">Level</TableHead>
                        <TableHead className="text-slate-600">Source</TableHead>
                        <TableHead className="text-slate-600">Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {systemLogs.map((log) => (
                        <TableRow key={log.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="text-slate-500">
                            {new Date(log.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge className={getLogLevelColor(log.log_level)}>
                              {log.log_level}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-600">{log.source}</TableCell>
                          <TableCell className="text-slate-700 max-w-md truncate">{log.message}</TableCell>
                        </TableRow>
                      ))}
                      {systemLogs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                            No system logs found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config">
            <Card className="bg-white border-blue-100 shadow-sm">
              <CardContent className="p-6">
                <SystemConfigPanel />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Admin OTP Tab */}
          <TabsContent value="admin-otp">
            <AdminPasswordResetManager />
          </TabsContent>

          <TabsContent value="jamb">
            <SuperAdminJambSync />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default SuperAdmin;
