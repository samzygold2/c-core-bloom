import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, ChartColumn, ChevronRight, CircleCheck, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Download, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { downloadTestResultPDF, downloadBulkTestResultsPDF } from '@/lib/pdfGenerator';

interface UserTest {
  id: string;
  score: number;
  start_time: string;
  end_time: string;
  answers?: Record<string, unknown> | null;
  test_id?: string;
  tests: {
    title: string;
    total_questions: number;
  } | null;
}

const Results = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [testFilter, setTestFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const navigate = useNavigate();
  const [results, setResults] = useState<UserTest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResults = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('user_tests')
      .select(`id, score, start_time, end_time, answers, test_id, tests (title, total_questions)`)
      .eq('user_id', user.id)
      .not('score', 'is', null)
      .order('start_time', { ascending: false });

    if (!error && data) {
      setResults(data as unknown as UserTest[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    fetchResults();
  }, [user, authLoading, navigate, fetchResults]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pct = (r: UserTest) => r.score / (r.tests?.total_questions || 1);
  const testTitles = Array.from(new Set(results.map((r) => r.tests?.title ?? 'Untitled test'))).sort();
  const visible = results
    .filter((r) => {
      const t = r.tests?.title ?? 'Untitled test';
      if (testFilter !== 'all' && t !== testFilter) return false;
      const q = search.trim().toLowerCase();
      return !q || t.toLowerCase().includes(q) || format(new Date(r.start_time), 'd MMM yyyy HH:mm').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const ta = a.tests?.title ?? '', tb = b.tests?.title ?? '';
      switch (sortBy) {
        case 'oldest': return +new Date(a.start_time) - +new Date(b.start_time);
        case 'az': return ta.localeCompare(tb);
        case 'za': return tb.localeCompare(ta);
        case 'high': return pct(b) - pct(a);
        case 'low': return pct(a) - pct(b);
        default: return +new Date(b.start_time) - +new Date(a.start_time);
      }
    });
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)));

  const toPdf = (r: UserTest) => ({
    studentName: user?.user_metadata?.firstname ? `${user.user_metadata.firstname} ${user.user_metadata.lastname ?? ''}`.trim() : (user?.email ?? ''),
    email: user?.email ?? '',
    testTitle: r.tests?.title ?? 'Untitled test',
    score: r.score,
    totalQuestions: r.tests?.total_questions || 0,
    startTime: r.start_time,
    endTime: r.end_time,
    answers: (r.answers ?? {}) as Record<string, unknown>,
  });
  const downloadIds = (ids: string[]) => {
    const rows = results.filter((r) => ids.includes(r.id));
    if (rows.length === 1) downloadTestResultPDF(toPdf(rows[0]));
    else if (rows.length > 1) downloadBulkTestResultsPDF(rows.map(toPdf));
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const ids = pendingDelete;
    setPendingDelete(null);
    const { data, error } = await supabase.from('user_tests').delete().in('id', ids).select('id');
    if (error || !data?.length) {
      toast({ title: 'Could not delete', description: error?.message ?? 'You do not have permission to delete these results.', variant: 'destructive' });
      return;
    }
    const gone = new Set(data.map((d) => d.id));
    setResults((prev) => prev.filter((r) => !gone.has(r.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
    toast({ title: `Deleted ${gone.size} result${gone.size > 1 ? 's' : ''}` });
  };

  const getScoreVariant = (score: number, total: number): 'default' | 'secondary' | 'destructive' => {
    const percentage = (score / total) * 100;
    if (percentage >= 80) return 'default';
    if (percentage >= 60) return 'secondary';
    return 'destructive';
  };

  return (
    <DashboardLayout title="My results" subtitle="Every test you have submitted, newest first">
      {loading ? (
        <div className="grid gap-3 sm:gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-20 sm:h-24 bg-muted" />
            </Card>
          ))}
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 sm:py-12 text-center">
            <ChartColumn className="h-10 w-10 text-muted-foreground mb-3 sm:mb-4" />
            <p className="text-lg font-semibold">No results yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Submit a test and your score lands here, with a PDF you can download.
            </p>
            <Button onClick={() => navigate('/dashboard')} className="mt-4 h-11 sm:h-10">
              See my tests
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
        {isAdmin && (
          <div className="mb-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by test or date" className="pl-9" />
              </div>
              <Select value={testFilter} onValueChange={setTestFilter}>
                <SelectTrigger className="sm:w-48"><SelectValue placeholder="All tests" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tests</SelectItem>
                  {testTitles.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="az">Test / topic A–Z</SelectItem>
                  <SelectItem value="za">Test / topic Z–A</SelectItem>
                  <SelectItem value="high">Highest score</SelectItem>
                  <SelectItem value="low">Lowest score</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} /> Select all ({visible.length})
              </label>
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" disabled={!selected.size} onClick={() => downloadIds([...selected])}>
                  <Download className="mr-1 h-4 w-4" /> Download
                </Button>
                <Button size="sm" variant="destructive" disabled={!selected.size} onClick={() => setPendingDelete([...selected])}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          {visible.length === 0 && <p className="text-sm text-muted-foreground">No results match your search.</p>}
          {visible.map((result) => {
            const testTitle = result.tests?.title ?? 'Untitled test';
            const total = result.tests?.total_questions || 1;
            const percentage = ((result.score / total) * 100).toFixed(1);
            return (
              <div key={result.id} className="relative min-w-0">
              {isAdmin && (
                <div className="absolute right-3 bottom-3 z-10 flex items-center gap-1">
                  <Checkbox checked={selected.has(result.id)} onCheckedChange={() => toggle(result.id)} aria-label="Select result" className="mr-1" />
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Download result" onClick={() => downloadIds([result.id])}><Download className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label="Delete result" onClick={() => setPendingDelete([result.id])}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )}
              <button
                type="button"
                onClick={() => navigate(`/results/${result.id}`)}
                className="group w-full h-full min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Card className="h-full transition-shadow group-hover:shadow-lg">
                  <CardHeader className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg mb-1.5 truncate">{testTitle}</CardTitle>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(result.start_time), 'd MMM yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(result.start_time), 'HH:mm')}
                          </span>
                        </div>
                      </div>
                      <Badge variant={getScoreVariant(result.score, total)} className="shrink-0">
                        {percentage}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-2 p-4 pt-0 sm:p-5 sm:pt-0">
                    <div className="flex items-center gap-2">
                      <CircleCheck className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm sm:text-base font-semibold">
                        {result.score} / {total}
                      </span>
                      <span className="text-xs sm:text-sm text-muted-foreground">correct</span>
                    </div>
                    {!isAdmin && <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
                  </CardContent>
                </Card>
              </button>
              </div>
            );
          })}
        </div>
        </>
      )}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.length} result{(pendingDelete?.length ?? 0) > 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the selected results. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Results;
