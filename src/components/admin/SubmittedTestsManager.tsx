import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface SubmittedRow {
  id: string;
  user_id: string;
  test_id: string;
  score: number | null;
  end_time: string | null;
  firstname: string;
  lastname: string;
  email: string;
  description: string | null;
  avatar_url: string | null;
  test_title: string;
  total_questions: number;
}

export function SubmittedTestsManager() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SubmittedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchSubmissions();
  }, [user]);

  const fetchSubmissions = async () => {
    if (!user) return;
    setLoading(true);

    // 1. Get this admin's assigned users (from profiles + user_admins)
    const [{ data: assignedProfiles }, { data: linkedUsers }] = await Promise.all([
      supabase.from('profiles').select('id').eq('assigned_admin_id', user.id),
      supabase.from('user_admins').select('user_id').eq('admin_id', user.id).eq('status', 'approved'),
    ]);

    const userIds = Array.from(
      new Set([...(assignedProfiles || []).map((p) => p.id), ...(linkedUsers || []).map((u) => u.user_id)])
    );
    if (userIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 2. Get this admin's tests
    const { data: myTests } = await supabase.from('tests').select('id, title, total_questions').eq('created_by', user.id);
    const testIds = (myTests || []).map((t) => t.id);
    if (testIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 3. Get submitted user_tests (end_time set) for those users + tests
    const { data: submissions } = await supabase
      .from('user_tests')
      .select('id, user_id, test_id, score, end_time')
      .in('user_id', userIds)
      .in('test_id', testIds)
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false });

    if (!submissions || submissions.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 4. Fetch profiles for those users
    const submittedUserIds = Array.from(new Set(submissions.map((s) => s.user_id)));
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, firstname, lastname, email, description, avatar_url')
      .in('id', submittedUserIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    const testMap = new Map((myTests || []).map((t) => [t.id, t]));

    setRows(
      submissions.map((s) => {
        const p: any = profileMap.get(s.user_id) || {};
        const t: any = testMap.get(s.test_id) || {};
        return {
          id: s.id,
          user_id: s.user_id,
          test_id: s.test_id,
          score: s.score,
          end_time: s.end_time,
          firstname: p.firstname || '',
          lastname: p.lastname || '',
          email: p.email || '',
          description: p.description || null,
          avatar_url: p.avatar_url || null,
          test_title: t.title || 'Unknown test',
          total_questions: t.total_questions || 0,
        };
      })
    );
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submitted Tests</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No submitted tests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>About</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const name = `${r.firstname} ${r.lastname}`.trim() || r.email;
                  const initials = `${r.firstname?.[0] || ''}${r.lastname?.[0] || ''}`.toUpperCase() || 'U';
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={r.avatar_url || undefined} alt={name} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                          {r.description || <span className="italic">No description</span>}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">{r.test_title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {r.score ?? 0} / {r.total_questions}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.end_time ? new Date(r.end_time).toLocaleString() : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
