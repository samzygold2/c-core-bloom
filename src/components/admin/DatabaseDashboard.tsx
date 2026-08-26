import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Database,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

type Row = Record<string, any>;

interface TableConfig {
  name: string;
  label: string;
  description: string;
  searchColumns: string[];
  columns: string[];
  editable: string[];
  filters?: { column: string; label: string; type: 'text' | 'number' }[];
  orderBy: string;
}

const TABLES: TableConfig[] = [
  {
    name: 'past_questions',
    label: 'JAMB Questions',
    description: 'Past questions synced from the exam provider',
    searchColumns: ['question_text', 'subject'],
    columns: ['subject', 'year', 'question_text', 'correct_answer', 'needs_review', 'is_quarantined'],
    editable: [
      'subject',
      'year',
      'question_text',
      'option_a',
      'option_b',
      'option_c',
      'option_d',
      'correct_answer',
      'explanation',
      'exam_type',
      'needs_review',
      'is_quarantined',
      'quarantine_reason',
    ],
    filters: [
      { column: 'subject', label: 'Subject', type: 'text' },
      { column: 'year', label: 'Year', type: 'number' },
    ],
    orderBy: 'created_at',
  },
  {
    name: 'profiles',
    label: 'Profiles',
    description: 'Student and admin accounts',
    searchColumns: ['email', 'firstname', 'lastname', 'username'],
    columns: ['firstname', 'lastname', 'email', 'username', 'is_active', 'is_pending', 'is_waiting'],
    editable: [
      'firstname',
      'lastname',
      'email',
      'username',
      'description',
      'is_active',
      'is_pending',
      'is_waiting',
    ],
    orderBy: 'created_at',
  },
  {
    name: 'tests',
    label: 'Tests',
    description: 'Tests created by admins',
    searchColumns: ['title'],
    columns: ['title', 'duration_minutes', 'total_questions', 'is_active', 'created_at'],
    editable: ['title', 'duration_minutes', 'is_active'],
    orderBy: 'created_at',
  },
  {
    name: 'questions',
    label: 'Test Questions',
    description: 'Questions belonging to admin-created tests',
    searchColumns: ['question_text'],
    columns: ['question_text', 'correct_answer', 'difficulty', 'is_reviewed', 'created_at'],
    editable: ['question_text', 'correct_answer', 'difficulty', 'is_reviewed'],
    orderBy: 'created_at',
  },
  {
    name: 'user_tests',
    label: 'Test Submissions',
    description: 'Student test sessions and scores',
    searchColumns: [],
    columns: ['user_id', 'test_id', 'score', 'start_time', 'end_time'],
    editable: ['score'],
    orderBy: 'created_at',
  },
  {
    name: 'user_roles',
    label: 'User Roles',
    description: 'Role assignments (user, admin, super_admin)',
    searchColumns: [],
    columns: ['user_id', 'role'],
    editable: ['role'],
    orderBy: 'id',
  },
  {
    name: 'question_visibility',
    label: 'Question Visibility',
    description: 'Which JAMB questions each admin has activated',
    searchColumns: [],
    columns: ['question_id', 'admin_id', 'is_active', 'activated_at'],
    editable: ['is_active'],
    orderBy: 'created_at',
  },
];

const PAGE_SIZE = 25;

const formatCell = (value: any) => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value);
  return str.length > 80 ? `${str.slice(0, 80)}…` : str;
};

export function DatabaseDashboard() {
  const { toast } = useToast();
  const [tableName, setTableName] = useState(TABLES[0].name);
  const config = useMemo(() => TABLES.find((t) => t.name === tableName)!, [tableName]);

  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editValues, setEditValues] = useState<Row>({});
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      let query = (supabase.from(config.name as any) as any).select('*', { count: 'exact' });

      if (search.trim() && config.searchColumns.length > 0) {
        const term = search.trim().replace(/[%,]/g, '');
        query = query.or(config.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(','));
      }

      for (const f of config.filters || []) {
        const value = filters[f.column];
        if (value && value.trim()) {
          if (f.type === 'number') {
            const num = Number(value);
            if (!Number.isNaN(num)) query = query.eq(f.column, num);
          } else {
            query = query.ilike(f.column, `%${value.trim()}%`);
          }
        }
      }

      const { data, error, count: total } = await query
        .order(config.orderBy, { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (error) throw error;
      setRows((data as Row[]) || []);
      setCount(total || 0);
    } catch (error: any) {
      setRows([]);
      setCount(0);
      toast({
        title: 'Could not load table',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [config, page, search, filters, toast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleTableChange = (value: string) => {
    setTableName(value);
    setPage(0);
    setSearch('');
    setFilters({});
  };

  const openEdit = (row: Row) => {
    const values: Row = {};
    for (const key of config.editable) values[key] = row[key];
    setEditValues(values);
    setEditRow(row);
  };

  const saveEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const payload: Row = {};
      for (const key of config.editable) {
        let value = editValues[key];
        if (typeof editRow[key] === 'number' && value !== null && value !== '') {
          const num = Number(value);
          value = Number.isNaN(num) ? editRow[key] : num;
        }
        if (value === '') value = null;
        payload[key] = value;
      }

      const { error } = await (supabase.from(config.name as any) as any)
        .update(payload)
        .eq('id', editRow.id);
      if (error) throw error;

      toast({ title: 'Record updated', description: `${config.label} record saved.` });
      setEditRow(null);
      fetchRows();
    } catch (error: any) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteRow) return;
    try {
      const { error } = await (supabase.from(config.name as any) as any)
        .delete()
        .eq('id', deleteRow.id);
      if (error) throw error;
      toast({ title: 'Record deleted', description: `1 row removed from ${config.label}.` });
      setDeleteRow(null);
      fetchRows();
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Database className="h-5 w-5" />
                Database Dashboard
              </CardTitle>
              <CardDescription>{config.description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{count.toLocaleString()} rows</Badge>
              <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Table</Label>
              <Select value={tableName} onValueChange={handleTableChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TABLES.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {config.searchColumns.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={`Search ${config.searchColumns.join(', ')}`}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                </div>
              </div>
            )}

            {(config.filters || []).map((f) => (
              <div key={f.column} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  placeholder={`Filter by ${f.label.toLowerCase()}`}
                  value={filters[f.column] || ''}
                  onChange={(e) => {
                    setFilters((prev) => ({ ...prev, [f.column]: e.target.value }));
                    setPage(0);
                  }}
                />
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {config.columns.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap capitalize">
                      {c.replace(/_/g, ' ')}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={config.columns.length + 1} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={config.columns.length + 1}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No records found
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      {config.columns.map((c) => (
                        <TableCell key={c} className="max-w-[280px] align-top text-sm">
                          {formatCell(row[c])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteRow(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editRow} onOpenChange={(open) => !open && setEditRow(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {config.label} record</DialogTitle>
            <DialogDescription className="break-all">ID: {editRow?.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {config.editable.map((key) => {
              const original = editRow?.[key];
              const value = editValues[key];
              if (typeof original === 'boolean') {
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs capitalize">{key.replace(/_/g, ' ')}</Label>
                    <Select
                      value={value ? 'true' : 'false'}
                      onValueChange={(v) => setEditValues((p) => ({ ...p, [key]: v === 'true' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              const isLong = typeof original === 'string' && original.length > 80;
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs capitalize">{key.replace(/_/g, ' ')}</Label>
                  {isLong ? (
                    <Textarea
                      rows={4}
                      value={value ?? ''}
                      onChange={(e) => setEditValues((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      value={value ?? ''}
                      onChange={(e) => setEditValues((p) => ({ ...p, [key]: e.target.value }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRow} onOpenChange={(open) => !open && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              This permanently removes the row from {config.label} (ID: {deleteRow?.id}). This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default DatabaseDashboard;
