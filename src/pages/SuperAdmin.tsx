import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  Users, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Search,
  RefreshCw,
  LogOut,
  Database,
  FileText,
  UserCog
} from 'lucide-react';

interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  timestamp: string;
  admin_email?: string;
}

interface UserWithRoles {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  created_at: string;
  roles: string[];
}

interface SystemStats {
  totalUsers: number;
  totalAdmins: number;
  totalTests: number;
  totalQuestions: number;
  activeTests: number;
  completedTests: number;
}

const SuperAdmin = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    totalAdmins: 0,
    totalTests: 0,
    totalQuestions: 0,
    activeTests: 0,
    completedTests: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkSuperAdminAccess();
  }, []);

  const checkSuperAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/super-admin-login');
      return;
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .single();

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
      fetchUsers(),
      fetchStats(),
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

    // Fetch admin emails for each log
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

  const fetchUsers = async () => {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching profiles:', error);
      return;
    }

    // Fetch roles for each user
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
      { count: activeTests },
      { count: completedTests },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('user_roles').select('*').eq('role', 'admin'),
      supabase.from('tests').select('*', { count: 'exact', head: true }),
      supabase.from('questions').select('*', { count: 'exact', head: true }),
      supabase.from('tests').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('user_tests').select('*', { count: 'exact', head: true }).not('end_time', 'is', null),
    ]);

    setStats({
      totalUsers: totalUsers || 0,
      totalAdmins: adminRoles?.length || 0,
      totalTests: totalTests || 0,
      totalQuestions: totalQuestions || 0,
      activeTests: activeTests || 0,
      completedTests: completedTests || 0,
    });
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

    // Log the action
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
        return 'bg-purple-600 text-white';
      case 'admin':
        return 'bg-red-600 text-white';
      case 'user':
        return 'bg-blue-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      {/* Header */}
      <header className="border-b border-purple-500/30 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Super Admin Dashboard</h1>
              <p className="text-sm text-slate-400">System Monitoring & Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAllData}
              className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-blue-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalUsers}</p>
                  <p className="text-xs text-slate-400">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <UserCog className="h-8 w-8 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalAdmins}</p>
                  <p className="text-xs text-slate-400">Admins</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-green-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalTests}</p>
                  <p className="text-xs text-slate-400">Total Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-yellow-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.totalQuestions}</p>
                  <p className="text-xs text-slate-400">Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-emerald-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.activeTests}</p>
                  <p className="text-xs text-slate-400">Active Tests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-purple-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{stats.completedTests}</p>
                  <p className="text-xs text-slate-400">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="users" className="data-[state=active]:bg-purple-600">
              <Users className="h-4 w-4 mr-2" />
              User Management
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-purple-600">
              <Activity className="h-4 w-4 mr-2" />
              Audit Logs
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">User Management</CardTitle>
                <CardDescription className="text-slate-400">
                  Manage user roles and permissions across the platform
                </CardDescription>
                <div className="flex gap-4 mt-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white">
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
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-700/50 hover:bg-slate-700/50">
                        <TableHead className="text-slate-300">User</TableHead>
                        <TableHead className="text-slate-300">Email</TableHead>
                        <TableHead className="text-slate-300">Roles</TableHead>
                        <TableHead className="text-slate-300">Joined</TableHead>
                        <TableHead className="text-slate-300">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id} className="border-slate-700 hover:bg-slate-700/30">
                          <TableCell className="text-white font-medium">
                            {user.firstname} {user.lastname}
                          </TableCell>
                          <TableCell className="text-slate-300">{user.email}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {user.roles.map((role) => (
                                <Badge key={role} className={getRoleBadgeColor(role)}>
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-400">
                            {new Date(user.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              {!user.roles.includes('admin') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAssignRole(user.id, 'admin')}
                                  className="border-green-500/50 text-green-400 hover:bg-green-500/20 text-xs"
                                >
                                  + Admin
                                </Button>
                              )}
                              {user.roles.includes('admin') && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRemoveRole(user.id, 'admin')}
                                  className="border-red-500/50 text-red-400 hover:bg-red-500/20 text-xs"
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

          {/* Audit Logs Tab */}
          <TabsContent value="audit">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Audit Logs</CardTitle>
                <CardDescription className="text-slate-400">
                  Track all administrative actions across the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-700/50 hover:bg-slate-700/50">
                        <TableHead className="text-slate-300">Timestamp</TableHead>
                        <TableHead className="text-slate-300">Admin</TableHead>
                        <TableHead className="text-slate-300">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log.id} className="border-slate-700 hover:bg-slate-700/30">
                          <TableCell className="text-slate-400">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {new Date(log.timestamp).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="text-white">{log.admin_email}</TableCell>
                          <TableCell className="text-slate-300">{log.action}</TableCell>
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
        </Tabs>
      </main>
    </div>
  );
};

export default SuperAdmin;