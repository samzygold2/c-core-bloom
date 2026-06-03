import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, CalendarIcon, X } from 'lucide-react';
import { format, isAfter, isBefore, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';

interface SubmittedRow {
  id: string;
  user_id: string;
  test_id: string;
  score: number | null;
  end_time: string | null;
  start_time: string | null;
  firstname: string;
  lastname: string;
  email: string;
  description: string | null;
  avatar_url: string | null;
  test_title: string;
  total_questions: number;
}

type SubmissionStatus = 'all' | 'submitted' | 'in_progress';

export function SubmittedTestsManager() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SubmittedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus>('all');
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

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

    // 3. Get ALL user_tests for those users + tests (submitted and in-progress)
    const { data: submissions } = await supabase
      .from('user_tests')
      .select('id, user_id, test_id, score, end_time, start_time')
      .in('user_id', userIds)
      .in('test_id', testIds)
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
          start_time: s.start_time,
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

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setFromDate(undefined);
    setToDate(undefined);
  };

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const name = `${r.firstname} ${r.lastname}`.trim().toLowerCase();
      const email = r.email.toLowerCase();
      const testTitle = r.test_title.toLowerCase();
      const search = searchTerm.trim().toLowerCase();

      // Search filter
      if (search && !name.includes(search) && !email.includes(search) && !testTitle.includes(search)) {
        return false;
      }

      // Status filter
      const isSubmitted = r.end_time !== null;
      if (statusFilter === 'submitted' && !isSubmitted) return false;
      if (statusFilter === 'in_progress' && isSubmitted) return false;

      // Date filter
      const relevantDate = isSubmitted ? r.end_time : r.start_time;
      if (relevantDate) {
        const dateObj = new Date(relevantDate);
        if (fromDate) {
          const fromStart = startOfDay(fromDate);
          if (isBefore(dateObj, fromStart) && !isSameDay(dateObj, fromStart)) return false;
        }
        if (toDate) {
          const toEnd = endOfDay(toDate);
          if (isAfter(dateObj, toEnd) && !isSameDay(dateObj, toEnd)) return false;
        }
      } else if (fromDate || toDate) {
        // If there's no date to compare and a date filter is active, exclude in-progress without start_time
        return false;
      }

      return true;
    });
  }, [rows, searchTerm, statusFilter, fromDate, toDate]);

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || fromDate || toDate;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submitted Tests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by student name or test title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SubmissionStatus)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* From Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full sm:w-auto justify-start text-left font-normal',
                    !fromDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, 'PPP') : 'From Date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={setFromDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {/* To Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full sm:w-auto justify-start text-left font-normal',
                    !toDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, 'PPP') : 'To Date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={setToDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground">
          Showing {filteredRows.length} of {rows.length} result{rows.length !== 1 ? 's' : ''}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {hasActiveFilters ? 'No results match your filters.' : 'No submitted tests yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>About</TableHead>
                  <TableHead>Test</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => {
                  const name = `${r.firstname} ${r.lastname}`.trim() || r.email;
                  const initials = `${r.firstname?.[0] || ''}${r.lastname?.[0] || ''}`.toUpperCase() || 'U';
                  const isSubmitted = r.end_time !== null;
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
                        {isSubmitted ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">Submitted</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">In Progress</Badge>
                        )}
                      </TableCell>
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
