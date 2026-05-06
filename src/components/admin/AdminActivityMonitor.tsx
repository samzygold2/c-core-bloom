import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Activity, FileText, HelpCircle, Users as UsersIcon, Clock, Eye, RefreshCw, Search, UserX, UserCheck,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AdminProfile {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
}

interface AdminTest {
  id: string;
  title: string;
  duration_minutes: number;
  is_active: boolean;
  total_questions: number | null;
  created_at: string | null;
}

interface AdminQuestion {
  id: string;
  question_text: string;
  options: any;
  correct_answer: number;
  difficulty: string | null;
  is_reviewed: boolean | null;
  created_at: string | null;
  test_id: string;
  test_title?: string;
}

interface AdminAuditEntry {
  id: string;
  action: string;
  timestamp: string | null;
}

interface AssignedUser {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  username: string | null;
  is_active: boolean;
  link_type: 'primary' | 'linked';
}

interface AdminStats {
  testCount: number;
  questionCount: number;
  assignedUserCount: number;
  reviewedQuestionCount: number;
}

const AdminActivityMonitor = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<AdminStats>({
    testCount: 0,
    questionCount: 0,
    assignedUserCount: 0,
    reviewedQuestionCount: 0,
  });
  const [tests, setTests] = useState<AdminTest[]>([]);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [viewQuestion, setViewQuestion] = useState<AdminQuestion | null>(null);
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [confirmUser, setConfirmUser] = useState<AssignedUser | null>(null);

  useEffect(() => {
    loadAdmins();
  }, []);

  useEffect(() => {
    if (selectedAdminId) loadAdminActivity(selectedAdminId);
  }, [selectedAdminId]);

  const loadAdmins = async () => {
    setLoading(true);
    const { data: roleRows, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (error) {
      toast({ title: 'Error', description: 'Failed to load admins.', variant: 'destructive' });
      setLoading(false);
      return;
    }

    const ids = (roleRows || []).map((r) => r.user_id);
    if (ids.length === 0) {
      setAdmins([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, firstname, lastname, email')
      .in('id', ids);

    const list = (profiles || []) as AdminProfile[];
    setAdmins(list);
    if (list.length > 0 && !selectedAdminId) setSelectedAdminId(list[0].id);
    setLoading(false);
  };

  const loadAdminActivity = async (adminId: string) => {
    const [
      { data: testsData },
      { data: questionsData },
      { data: auditData },
      { data: primaryUsers },
      { data: linkedRows },
      { count: reviewedCount },
    ] = await Promise.all([
      supabase
        .from('tests')
        .select('id, title, duration_minutes, is_active, total_questions, created_at')
        .eq('created_by', adminId)
        .order('created_at', { ascending: false }),
      supabase
        .from('questions')
        .select('id, question_text, options, correct_answer, difficulty, is_reviewed, created_at, test_id')
        .eq('created_by', adminId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('audit_log')
        .select('id, action, timestamp')
        .eq('admin_id', adminId)
        .order('timestamp', { ascending: false })
        .limit(100),
      supabase
        .from('profiles')
        .select('id, firstname, lastname, email, username, is_active')
        .eq('assigned_admin_id', adminId),
      supabase
        .from('user_admins')
        .select('user_id')
        .eq('admin_id', adminId)
        .eq('status', 'approved'),
      supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', adminId)
        .eq('is_reviewed', true),
    ]);

    const testList = (testsData || []) as AdminTest[];
    const titleById = new Map(testList.map((t) => [t.id, t.title]));
    const enrichedQuestions = (questionsData || []).map((q: any) => ({
      ...q,
      test_title: titleById.get(q.test_id) || 'Unknown',
    })) as AdminQuestion[];

    const primaryList: AssignedUser[] = (primaryUsers || []).map((u: any) => ({
      ...u,
      is_active: u.is_active ?? true,
      link_type: 'primary' as const,
    }));
    const primaryIds = new Set(primaryList.map((u) => u.id));
    const linkedIds = (linkedRows || [])
      .map((r: any) => r.user_id)
      .filter((id: string) => !primaryIds.has(id));

    let linkedList: AssignedUser[] = [];
    if (linkedIds.length > 0) {
      const { data: linkedProfiles } = await supabase
        .from('profiles')
        .select('id, firstname, lastname, email, username, is_active')
        .in('id', linkedIds);
      linkedList = (linkedProfiles || []).map((u: any) => ({
        ...u,
        is_active: u.is_active ?? true,
        link_type: 'linked' as const,
      }));
    }

    const allUsers = [...primaryList, ...linkedList];
    setTests(testList);
    setQuestions(enrichedQuestions);
    setAuditEntries((auditData || []) as AdminAuditEntry[]);
    setAssignedUsers(allUsers);
    setStats({
      testCount: testList.length,
      questionCount: enrichedQuestions.length,
      assignedUserCount: allUsers.length,
      reviewedQuestionCount: reviewedCount || 0,
    });
  };

  const toggleUserActive = async (user: AssignedUser) => {
    const newStatus = !user.is_active;
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: newStatus })
      .eq('id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: newStatus ? 'User activated' : 'User deactivated',
      description: `${user.firstname} ${user.lastname} is now ${newStatus ? 'active' : 'deactivated'}.`,
    });
    setAssignedUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u)));
    setConfirmUser(null);
  };

  const filteredAdmins = admins.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.email.toLowerCase().includes(q) ||
      a.firstname.toLowerCase().includes(q) ||
      a.lastname.toLowerCase().includes(q)
    );
  });

  const selectedAdmin = admins.find((a) => a.id === selectedAdminId);

  const parseOptions = (options: any): string[] => {
    if (Array.isArray(options)) return options.map(String);
    if (typeof options === 'string') {
      try {
        const parsed = JSON.parse(options);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  return (
    <Card className="bg-white border-blue-100 shadow-sm">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-slate-800 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Admin Activity Monitor
            </CardTitle>
            <CardDescription className="text-slate-500">
              Review every test, question and action created by each admin
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedAdminId && loadAdminActivity(selectedAdminId)}
            className="border-blue-300 text-blue-600 hover:bg-blue-50 self-start md:self-auto"
          >
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-3 mt-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search admins..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white border-blue-200"
            />
          </div>
          <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
            <SelectTrigger className="w-full md:w-80 bg-white border-blue-200">
              <SelectValue placeholder="Select an admin" />
            </SelectTrigger>
            <SelectContent>
              {filteredAdmins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.firstname} {a.lastname} — {a.email}
                </SelectItem>
              ))}
              {filteredAdmins.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-500">No admins found</div>
              )}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <p className="text-slate-500 text-sm py-8 text-center">Loading admins...</p>
        ) : !selectedAdmin ? (
          <p className="text-slate-500 text-sm py-8 text-center">Select an admin to view their activity.</p>
        ) : (
          <>
            {/* Admin stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Card className="border-blue-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <FileText className="h-7 w-7 text-blue-500" />
                  <div>
                    <p className="text-xl font-bold text-slate-800">{stats.testCount}</p>
                    <p className="text-xs text-slate-500">Tests created</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <HelpCircle className="h-7 w-7 text-sky-500" />
                  <div>
                    <p className="text-xl font-bold text-slate-800">{stats.questionCount}</p>
                    <p className="text-xs text-slate-500">Questions set</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <UsersIcon className="h-7 w-7 text-emerald-500" />
                  <div>
                    <p className="text-xl font-bold text-slate-800">{stats.assignedUserCount}</p>
                    <p className="text-xs text-slate-500">Assigned users</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-blue-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <Activity className="h-7 w-7 text-blue-600" />
                  <div>
                    <p className="text-xl font-bold text-slate-800">{stats.reviewedQuestionCount}</p>
                    <p className="text-xs text-slate-500">Reviewed questions</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="tests" className="space-y-4">
              <TabsList className="bg-blue-50 border border-blue-100 flex-wrap h-auto">
                <TabsTrigger value="tests" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  Tests ({tests.length})
                </TabsTrigger>
                <TabsTrigger value="questions" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  Questions ({questions.length})
                </TabsTrigger>
                <TabsTrigger value="users" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  Users ({assignedUsers.length})
                </TabsTrigger>
                <TabsTrigger value="actions" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  Actions ({auditEntries.length})
                </TabsTrigger>
              </TabsList>


              <TabsContent value="tests">
                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead>Title</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Questions</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tests.map((t) => (
                        <TableRow key={t.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="font-medium text-slate-800">{t.title}</TableCell>
                          <TableCell className="text-slate-600">{t.duration_minutes} min</TableCell>
                          <TableCell className="text-slate-600">{t.total_questions ?? 0}</TableCell>
                          <TableCell>
                            <Badge className={t.is_active ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'}>
                              {t.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {tests.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                            No tests created
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="questions">
                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead>Question</TableHead>
                        <TableHead>Test</TableHead>
                        <TableHead>Difficulty</TableHead>
                        <TableHead>Reviewed</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questions.map((q) => (
                        <TableRow key={q.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="text-slate-800 max-w-sm truncate">{q.question_text}</TableCell>
                          <TableCell className="text-slate-600">{q.test_title}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {q.difficulty || 'medium'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={q.is_reviewed ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}>
                              {q.is_reviewed ? 'Yes' : 'Pending'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-500 text-sm">
                            {q.created_at ? new Date(q.created_at).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewQuestion(q)}
                              className="border-blue-300 text-blue-600 hover:bg-blue-50"
                            >
                              <Eye className="h-3 w-3 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {questions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                            No questions set
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="users">
                <div className="rounded-lg border border-blue-100 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead>Name</TableHead>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Link</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignedUsers.map((u) => (
                        <TableRow key={`${u.id}-${u.link_type}`} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="font-medium text-slate-800">
                            {u.firstname} {u.lastname}
                          </TableCell>
                          <TableCell className="text-slate-600">{u.username || '—'}</TableCell>
                          <TableCell className="text-slate-600">{u.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {u.link_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={u.is_active ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}>
                              {u.is_active ? 'Active' : 'Deactivated'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmUser(u)}
                              className={
                                u.is_active
                                  ? 'border-rose-300 text-rose-600 hover:bg-rose-50'
                                  : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'
                              }
                            >
                              {u.is_active ? (
                                <><UserX className="h-3 w-3 mr-1" /> Deactivate</>
                              ) : (
                                <><UserCheck className="h-3 w-3 mr-1" /> Activate</>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {assignedUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                            No assigned users
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>


                <div className="rounded-lg border border-blue-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50 hover:bg-blue-50">
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEntries.map((a) => (
                        <TableRow key={a.id} className="border-blue-50 hover:bg-blue-50/50">
                          <TableCell className="text-slate-500 text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-400" />
                              {a.timestamp ? new Date(a.timestamp).toLocaleString() : '—'}
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-700">{a.action}</TableCell>
                        </TableRow>
                      ))}
                      {auditEntries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-slate-400 py-8">
                            No recorded actions
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* Question detail dialog */}
        <Dialog open={!!viewQuestion} onOpenChange={(open) => !open && setViewQuestion(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Question Details</DialogTitle>
              <DialogDescription>
                Full question with options and correct answer
              </DialogDescription>
            </DialogHeader>
            {viewQuestion && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Test</p>
                  <p className="text-sm font-medium text-slate-800">{viewQuestion.test_title}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Question</p>
                  <p className="text-slate-800">{viewQuestion.question_text}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-2">Options</p>
                  <div className="space-y-2">
                    {parseOptions(viewQuestion.options).map((opt, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-md border text-sm ${
                          idx === viewQuestion.correct_answer
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-medium'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="mr-2 font-mono">{String.fromCharCode(65 + idx)}.</span>
                        {opt}
                        {idx === viewQuestion.correct_answer && (
                          <Badge className="ml-2 bg-emerald-500 text-white">Correct</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>Difficulty: <span className="text-slate-700 capitalize">{viewQuestion.difficulty || 'medium'}</span></span>
                  <span>Reviewed: <span className="text-slate-700">{viewQuestion.is_reviewed ? 'Yes' : 'No'}</span></span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default AdminActivityMonitor;
