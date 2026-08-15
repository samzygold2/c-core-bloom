import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Activity,
  Users,
  Database,
  Layers,
  Wrench,
  History,
  FileCheck2,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export interface AnomalyItem {
  id: string;
  type: 'duplicate' | 'missing_answer' | 'invalid_year' | 'sync_loop' | 'orphan_visibility';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  subject?: string;
  year?: number;
  count?: number;
  questionId?: string;
}

export interface AdminVisibilityStatus {
  adminId: string;
  name: string;
  email: string;
  totalAssigned: number;
  activeCount: number;
  inactiveCount: number;
  coveragePct: number;
}

export interface JambPipelineMetrics {
  totalQuestions: number;
  subjectsCount: number;
  yearsCount: number;
  totalAdmins: number;
  totalUserPracticeAttempts: number;
  duplicateCount: number;
  missingAnswerCount: number;
  outOfRangeYearCount: number;
  loopingJobCount: number;
  healthScore: number;
}

export interface SyncJobRecord {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | string;
  subjects?: string[];
  years?: number[];
  pages?: number;
  current_subject?: string | null;
  current_year?: number | null;
  current_page?: number;
  inserted?: number;
  failed?: number;
  errors?: string[];
  message?: string | null;
  started_at: string;
  consecutive_failures?: number;
}

export interface PastQuestionRow {
  id: string;
  subject?: string;
  year?: number;
  question_text?: string;
  correct_answer?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  aloc_id?: string;
}

export interface AuditHistoryLog {
  id: string;
  run_at: string;
  run_by: string | null;
  trigger_source: string;
  health_score: number;
  anomalies: Record<string, unknown>;
  actions_taken: Record<string, unknown> | null;
  duration_ms: number | null;
}

export interface DatabaseStorageStats {
  total_db_size_pretty: string;
  total_db_size_bytes: number;
  questions_count: number;
  visibility_count: number;
  sync_jobs_count: number;
  audit_logs_count: number;
  test_submissions_count: number;
  profiles_count: number;
  subject_distribution: Record<string, number>;
  tables_breakdown: Array<{
    table_name: string;
    total_size: string;
    size_bytes: number;
    estimated_rows?: number;
  }>;
  storage_level_pct: number;
  target_question_capacity: number;
  generated_at?: string;
}

export function SuperAdminJambMonitor() {
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [metrics, setMetrics] = useState<JambPipelineMetrics | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [adminStatuses, setAdminStatuses] = useState<AdminVisibilityStatus[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJobRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditHistoryLog[]>([]);
  const [dbStorageStats, setDbStorageStats] = useState<DatabaseStorageStats | null>(null);

  const fetchDatabaseStorageStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_database_storage_stats');
      if (!error && data) {
        setDbStorageStats(data as unknown as DatabaseStorageStats);
      } else {
        const { count: pqCount } = await supabase.from('past_questions').select('*', { count: 'exact', head: true });
        const { count: visCount } = await supabase.from('question_visibility').select('*', { count: 'exact', head: true });
        const { count: jobsCount } = await supabase.from('jamb_sync_jobs').select('*', { count: 'exact', head: true });
        const { count: subCount } = await supabase.from('test_submissions').select('*', { count: 'exact', head: true });
        
        const totalQuestions = pqCount || 0;
        const pct = Math.min(100, Number(((totalQuestions / 5000) * 100).toFixed(1)));
        const estBytes = totalQuestions * 1850 + (visCount || 0) * 120 + 2048000;
        const prettyKb = Math.round(estBytes / 1024);
        const prettySize = prettyKb > 1024 ? `${(prettyKb / 1024).toFixed(1)} MB` : `${prettyKb} KB`;

        setDbStorageStats({
          total_db_size_pretty: prettySize,
          total_db_size_bytes: estBytes,
          questions_count: totalQuestions,
          visibility_count: visCount || 0,
          sync_jobs_count: jobsCount || 0,
          audit_logs_count: auditLogs.length,
          test_submissions_count: subCount || 0,
          profiles_count: adminStatuses.length,
          subject_distribution: {},
          tables_breakdown: [
            { table_name: 'past_questions', total_size: `${Math.round((totalQuestions * 1850)/1024)} KB`, size_bytes: totalQuestions * 1850, estimated_rows: totalQuestions },
            { table_name: 'question_visibility', total_size: `${Math.round(((visCount||0) * 120)/1024)} KB`, size_bytes: (visCount||0) * 120, estimated_rows: visCount || 0 },
            { table_name: 'test_submissions', total_size: `${Math.round(((subCount||0) * 450)/1024)} KB`, size_bytes: (subCount||0) * 450, estimated_rows: subCount || 0 },
            { table_name: 'jamb_sync_jobs', total_size: `${Math.round(((jobsCount||0) * 800)/1024)} KB`, size_bytes: (jobsCount||0) * 800, estimated_rows: jobsCount || 0 },
          ],
          storage_level_pct: pct,
          target_question_capacity: 5000,
        });
      }
    } catch (err) {
      console.error('Failed to fetch db storage stats:', err);
    }
  }, [auditLogs.length, adminStatuses.length]);

  const fetchRecentSyncJobs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('jamb_sync_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);
      if (data) {
        setSyncJobs(data as unknown as SyncJobRecord[]);
      }
    } catch (err) {
      console.error('Failed to fetch sync jobs:', err);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('jamb_integrity_audit_log')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(30);
      if (data) {
        setAuditLogs(data as unknown as AuditHistoryLog[]);
      }
    } catch (err) {
      console.error('Failed to fetch audit history logs:', err);
    }
  }, []);

  const runClientAuditFallback = async () => {
    let allQuestions: PastQuestionRow[] = [];
    let fromIdx = 0;
    const batchSize = 5000;
    while (true) {
      const { data, error } = await supabase
        .from('past_questions')
        .select('id, subject, year, question_text, correct_answer, option_a, option_b, option_c, option_d, aloc_id')
        .range(fromIdx, fromIdx + batchSize - 1);
      if (error || !data || data.length === 0) break;
      allQuestions = [...allQuestions, ...data];
      if (data.length < batchSize) break;
      fromIdx += batchSize;
    }

    const totalQuestions = allQuestions.length;
    const subjectsSet = new Set<string>();
    const yearsSet = new Set<number>();
    let missingAnswerCount = 0;
    let outOfRangeYearCount = 0;

    const newAnomalies: AnomalyItem[] = [];
    const questionTextMap = new Map<string, string[]>();

    for (const q of allQuestions) {
      if (q.subject) subjectsSet.add(q.subject);
      if (typeof q.year === 'number') yearsSet.add(q.year);

      if (!q.correct_answer || !q.option_a || !q.option_b) {
        missingAnswerCount++;
        if (newAnomalies.length < 50) {
          newAnomalies.push({
            id: `missing_${q.id}`,
            type: 'missing_answer',
            severity: 'medium',
            title: `Missing Correct Answer or Options`,
            description: `Question ID ${q.id.slice(0, 8)} (${q.subject} - ${q.year}) has missing options/answer.`,
            subject: q.subject,
            year: q.year,
            questionId: q.id,
          });
        }
      }

      if (q.year && (q.year < 2009 || q.year > 2024)) {
        outOfRangeYearCount++;
        newAnomalies.push({
          id: `year_${q.id}`,
          type: 'invalid_year',
          severity: 'high',
          title: `Out-of-Range Year (${q.year})`,
          description: `JAMB questions should be 2009-2024. Found year ${q.year} for ${q.subject}.`,
          subject: q.subject,
          year: q.year,
          questionId: q.id,
        });
      }

      const normText = (q.question_text || '').trim().toLowerCase().slice(0, 100);
      const dupKey = `${q.subject}_${q.year}_${normText}`;
      const existing = questionTextMap.get(dupKey) || [];
      existing.push(q.id);
      questionTextMap.set(dupKey, existing);
    }

    let duplicateCount = 0;
    questionTextMap.forEach((ids, key) => {
      if (ids.length > 1) {
        duplicateCount += ids.length - 1;
        if (newAnomalies.length < 50) {
          const parts = key.split('_');
          newAnomalies.push({
            id: `dup_${ids[0]}`,
            type: 'duplicate',
            severity: 'high',
            title: `ALOC Sync Duplicate (${ids.length} copies)`,
            description: `Found ${ids.length} duplicate rows in ${parts[0]} (${parts[1]}): "${parts.slice(2).join('_').slice(0, 60)}..."`,
            subject: parts[0],
            year: Number(parts[1]) || 0,
            count: ids.length,
            questionId: ids[0],
          });
        }
      }
    });

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'super_admin']);
    const adminIds = Array.from(new Set((roleRows || []).map((r) => r.user_id)));

    let adminStatusList: AdminVisibilityStatus[] = [];
    if (adminIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, firstname, lastname, email')
        .in('id', adminIds);

      const { data: visData } = await supabase
        .from('question_visibility')
        .select('admin_id, is_active');

      const visByAdmin = new Map<string, { active: number; inactive: number }>();
      for (const v of visData || []) {
        const curr = visByAdmin.get(v.admin_id) || { active: 0, inactive: 0 };
        if (v.is_active) curr.active++;
        else curr.inactive++;
        visByAdmin.set(v.admin_id, curr);
      }

      adminStatusList = (profiles || []).map((p) => {
        const stats = visByAdmin.get(p.id) || { active: 0, inactive: 0 };
        const totalAssigned = stats.active + stats.inactive;
        const coveragePct = totalQuestions > 0 ? Math.min(100, Math.round((stats.active / totalQuestions) * 100)) : 0;
        return {
          adminId: p.id,
          name: `${p.firstname || ''} ${p.lastname || ''}`.trim() || 'Unnamed Admin',
          email: p.email || 'No email',
          totalAssigned,
          activeCount: stats.active,
          inactiveCount: stats.inactive,
          coveragePct,
        };
      });

      for (const adm of adminStatusList) {
        if (adm.coveragePct < 50 && totalQuestions > 100) {
          newAnomalies.push({
            id: `adm_orphan_${adm.adminId}`,
            type: 'orphan_visibility',
            severity: 'medium',
            title: `Low Question Visibility Allocation (${adm.coveragePct}%)`,
            description: `Admin ${adm.name} (${adm.email}) only has access to ${adm.activeCount} of ${totalQuestions} questions.`,
          });
        }
      }
    }
    setAdminStatuses(adminStatusList);

    let totalUserPracticeAttempts = 0;
    try {
      const { count } = await supabase
        .from('test_submissions')
        .select('id', { count: 'exact', head: true });
      totalUserPracticeAttempts = count || 0;
    } catch {
      // Table or RLS may be uninitialized
    }

    const penalty = duplicateCount * 3 + missingAnswerCount * 2 + outOfRangeYearCount * 5;
    const calculatedScore = Math.max(0, Math.min(100, 100 - penalty));

    setMetrics({
      totalQuestions,
      subjectsCount: subjectsSet.size,
      yearsCount: yearsSet.size,
      totalAdmins: adminIds.length,
      totalUserPracticeAttempts,
      duplicateCount,
      missingAnswerCount,
      outOfRangeYearCount,
      loopingJobCount: 0,
      healthScore: calculatedScore,
    });

    setAnomalies(newAnomalies);
  };

  const runFullAudit = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('jamb_run_integrity_audit');

      if (!rpcError && rpcData && typeof rpcData === 'object') {
        const report = rpcData as Record<string, unknown>;
        const totalQuestions = Number(report.total_questions || 0);
        const duplicateCount = Number(report.duplicate_count || 0);
        const missingAnswerCount = Number(report.missing_answer_count || 0);
        const invalidYearCount = Number(report.invalid_year_count || 0);
        const orphanVisibilityCount = Number(report.orphan_visibility_count || 0);
        const healthScore = Number(report.health_score || 100);

        const dupGroups = (report.duplicate_groups as Array<{
          content_hash: string;
          subject: string;
          year: number;
          cnt: number;
          ids: string[];
        }>) || [];

        const loopingJobs = (report.looping_jobs as Array<{
          id: string;
          status: string;
          current_subject?: string;
          current_year?: number;
          message?: string;
          error_count: number;
          consecutive_failures?: number;
        }>) || [];

        const lowCoverageAdmins = (report.low_coverage_admins as Array<{
          admin_id: string;
          active_count: number;
          total_questions: number;
          coverage_pct: number;
        }>) || [];

        const newAnomalies: AnomalyItem[] = [];

        dupGroups.forEach((dg, i) => {
          newAnomalies.push({
            id: `rpc_dup_${i}_${dg.content_hash}`,
            type: 'duplicate',
            severity: 'high',
            title: `Duplicate Question Group (${dg.cnt} copies)`,
            description: `Identical question content hash found across ${dg.cnt} rows in ${dg.subject} (${dg.year}).`,
            subject: dg.subject,
            year: dg.year,
            count: dg.cnt,
          });
        });

        if (missingAnswerCount > 0) {
          newAnomalies.push({
            id: 'rpc_missing_answers',
            type: 'missing_answer',
            severity: 'medium',
            title: `Incomplete Options / Correct Answers (${missingAnswerCount} rows)`,
            description: `${missingAnswerCount} past questions are missing correct_answer or options A-D.`,
            count: missingAnswerCount,
          });
        }

        if (invalidYearCount > 0) {
          newAnomalies.push({
            id: 'rpc_invalid_years',
            type: 'invalid_year',
            severity: 'high',
            title: `Out-of-Range Year Questions (${invalidYearCount} rows)`,
            description: `${invalidYearCount} past questions have year outside valid range 2009-2024.`,
            count: invalidYearCount,
          });
        }

        loopingJobs.forEach((lj) => {
          newAnomalies.push({
            id: `rpc_job_${lj.id}`,
            type: 'sync_loop',
            severity: lj.status === 'failed' ? 'medium' : 'high',
            title: `Looping / Stuck Sync Job (${lj.status.toUpperCase()})`,
            description: `Job ${lj.id.slice(0, 8)} reported ${lj.error_count} errors. Consecutive failures: ${lj.consecutive_failures || 0}.`,
            count: lj.error_count,
          });
        });

        if (orphanVisibilityCount > 0) {
          newAnomalies.push({
            id: 'rpc_orphan_visibility',
            type: 'orphan_visibility',
            severity: 'medium',
            title: `Orphan Question Visibility Records (${orphanVisibilityCount} rows)`,
            description: `${orphanVisibilityCount} visibility records point to non-existent questions.`,
            count: orphanVisibilityCount,
          });
        }

        lowCoverageAdmins.forEach((lca) => {
          newAnomalies.push({
            id: `rpc_admin_cov_${lca.admin_id}`,
            type: 'orphan_visibility',
            severity: 'low',
            title: `Low Question Allocation Coverage (${lca.coverage_pct}%)`,
            description: `Admin ${lca.admin_id.slice(0, 8)} has active access to only ${lca.active_count} of ${lca.total_questions} questions.`,
          });
        });

        setMetrics({
          totalQuestions,
          subjectsCount: 0,
          yearsCount: 0,
          totalAdmins: lowCoverageAdmins.length,
          totalUserPracticeAttempts: 0,
          duplicateCount,
          missingAnswerCount,
          outOfRangeYearCount: invalidYearCount,
          loopingJobCount: loopingJobs.length,
          healthScore,
        });

        setAnomalies(newAnomalies);
      } else {
        await runClientAuditFallback();
      }

      await fetchRecentSyncJobs();
      await fetchAuditLogs();
      await fetchDatabaseStorageStats();

      toast({
        title: 'JAMB Audit Complete',
        description: 'Audit executed successfully via Integrity & Recursion Guard engine.',
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to complete full JAMB ALOC sync audit.';
      console.error('Audit failed:', err);
      toast({
        title: 'Audit error',
        description: errMsg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [fetchRecentSyncJobs, fetchAuditLogs, fetchDatabaseStorageStats]);

  useEffect(() => {
    runFullAudit();
    const handleSync = () => {
      runFullAudit();
    };
    window.addEventListener('jamb-questions-approved', handleSync);

    // Subscribe to realtime database changes so monitor co-responds with DB live
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const triggerDebouncedAudit = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runFullAudit();
      }, 700);
    };

    const channel = supabase
      .channel('jamb_monitor_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'past_questions' }, triggerDebouncedAudit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jamb_sync_jobs' }, triggerDebouncedAudit)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'question_visibility' }, triggerDebouncedAudit)
      .subscribe();

    return () => {
      window.removeEventListener('jamb-questions-approved', handleSync);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [runFullAudit]);

  const resolveClientFallback = async () => {
    let resolvedCount = 0;
    let allQuestions: PastQuestionRow[] = [];
    let fromIdx = 0;
    const batchSize = 5000;
    while (true) {
      const { data, error } = await supabase
        .from('past_questions')
        .select('id, subject, year, question_text')
        .range(fromIdx, fromIdx + batchSize - 1);
      if (error || !data || data.length === 0) break;
      allQuestions = [...allQuestions, ...data];
      if (data.length < batchSize) break;
      fromIdx += batchSize;
    }

    const textMap = new Map<string, string[]>();
    for (const q of allQuestions) {
      const norm = `${q.subject}_${q.year}_${(q.question_text || '').trim().toLowerCase().slice(0, 100)}`;
      const existing = textMap.get(norm) || [];
      existing.push(q.id);
      textMap.set(norm, existing);
    }

    const duplicateIdsToDelete: string[] = [];
    textMap.forEach((ids) => {
      if (ids.length > 1) {
        duplicateIdsToDelete.push(...ids.slice(1));
      }
    });

    if (duplicateIdsToDelete.length > 0) {
      for (let i = 0; i < duplicateIdsToDelete.length; i += 500) {
        const chunk = duplicateIdsToDelete.slice(i, i + 500);
        await supabase
          .from('past_questions')
          .delete()
          .in('id', chunk);
      }
      resolvedCount += duplicateIdsToDelete.length;
    }

    const stuckJobs = syncJobs.filter((j) => j.status === 'running' && j.errors && j.errors.length > 3);
    for (const job of stuckJobs) {
      await supabase
        .from('jamb_sync_jobs')
        .update({ status: 'paused', message: 'Paused automatically by Super Admin Recursion Guard' })
        .eq('id', job.id);
      resolvedCount++;
    }

    toast({
      title: 'Fallback Resolution Complete',
      description: `Cleaned ${resolvedCount} duplicate records and stuck sync jobs.`,
    });
  };

  const resolveAllAnomalies = async () => {
    setResolving(true);
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('jamb_resolve_integrity_issues');

      if (!rpcError && rpcData && typeof rpcData === 'object') {
        const res = rpcData as Record<string, number>;
        toast({
          title: 'Integrity Auto-Resolution Complete',
          description: `Deleted ${res.deleted_duplicates || 0} duplicates, quarantined ${res.quarantined_invalid_year || 0} invalid years, flagged ${res.flagged_missing_answer || 0} missing data, paused ${res.paused_looping_jobs || 0} stuck jobs, removed ${res.orphan_visibility_removed || 0} orphan visibility rows, backfilled ${res.visibility_backfilled || 0} missing access rights.`,
        });
      } else {
        await resolveClientFallback();
      }

      await runFullAudit();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'An error occurred while resolving anomalies.';
      toast({
        title: 'Resolution error',
        description: errMsg,
        variant: 'destructive',
      });
    } finally {
      setResolving(false);
    }
  };

  const getSeverityBadge = (severity: AnomalyItem['severity']) => {
    switch (severity) {
      case 'high':
        return <Badge className="bg-red-600 text-white hover:bg-red-700">High Severity</Badge>;
      case 'medium':
        return <Badge className="bg-amber-600 text-white hover:bg-amber-700">Medium</Badge>;
      case 'low':
        return <Badge className="bg-blue-600 text-white hover:bg-blue-700">Low</Badge>;
      default:
        return <Badge variant="outline">Info</Badge>;
    }
  };

  const getTypeLabel = (type: AnomalyItem['type']) => {
    switch (type) {
      case 'duplicate':
        return 'ALOC Sync Duplication';
      case 'missing_answer':
        return 'Incomplete Question Data';
      case 'invalid_year':
        return 'Invalid Year Range';
      case 'sync_loop':
        return 'Job Recursion / Error Loop';
      case 'orphan_visibility':
        return 'Visibility Allocation Gap';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Actions */}
      <Card className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white border-0 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-emerald-400" />
                <CardTitle className="text-xl font-bold text-white">
                  JAMB ALOC Sync Integrity & Recursion Guard
                </CardTitle>
              </div>
              <CardDescription className="text-slate-300 mt-1">
                Full-stack pipeline monitor covering Super Admin ALOC syncs, Admin question visibility allocations, and User practice test consistency.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={runFullAudit}
                disabled={loading || resolving}
                variant="outline"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Auditing...' : 'Run Complete Audit'}
              </Button>
              <Button
                onClick={resolveAllAnomalies}
                disabled={loading || resolving || (anomalies.length === 0 && metrics?.healthScore === 100)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Wrench className={`h-4 w-4 mr-2 ${resolving ? 'animate-spin' : ''}`} />
                {resolving ? 'Resolving...' : 'Auto-Resolve Anomalies'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span>PIPELINE HEALTH SCORE</span>
                <Activity className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold">
                  {metrics ? `${metrics.healthScore}%` : '—'}
                </span>
                <span className="text-xs text-slate-400">
                  {metrics && metrics.healthScore >= 90
                    ? 'Excellent'
                    : metrics && metrics.healthScore >= 70
                    ? 'Needs Review'
                    : 'Critical'}
                </span>
              </div>
              {metrics && (
                <Progress
                  value={metrics.healthScore}
                  className="h-1.5 mt-2 bg-white/20"
                />
              )}
            </div>

            <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span>SYNCED JAMB QUESTIONS</span>
                <Database className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold mt-1">
                {metrics ? metrics.totalQuestions.toLocaleString() : '—'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Across {metrics?.subjectsCount || 0} subjects & {metrics?.yearsCount || 0} years
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span>DETECTED ANOMALIES</span>
                <AlertTriangle
                  className={`h-4 w-4 ${
                    anomalies.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                />
              </div>
              <div className="text-2xl font-bold mt-1">
                {anomalies.length}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {metrics?.duplicateCount || 0} duplicate recursion copies
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span>USER PRACTICE TESTS TAKEN</span>
                <Users className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold mt-1">
                {metrics ? metrics.totalUserPracticeAttempts.toLocaleString() : '—'}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {metrics?.totalAdmins || 0} admins managing access
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-3 backdrop-blur-sm border border-white/10">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span>DATABASE STORAGE LEVEL</span>
                <Database className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold">
                  {dbStorageStats ? dbStorageStats.total_db_size_pretty : '—'}
                </span>
                <span className="text-xs text-emerald-300 font-semibold">
                  {dbStorageStats ? `${dbStorageStats.storage_level_pct}% Capacity` : '—'}
                </span>
              </div>
              {dbStorageStats && (
                <Progress
                  value={dbStorageStats.storage_level_pct}
                  className="h-1.5 mt-2 bg-white/20"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Detailed Monitoring */}
      <Tabs defaultValue="anomalies" className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 bg-slate-100 p-1 rounded-lg">
          <TabsTrigger value="anomalies" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Anomalies & Recursions
            {anomalies.length > 0 && (
              <Badge className="ml-1 bg-amber-100 text-amber-800 hover:bg-amber-100">
                {anomalies.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-600" />
            Storage Level ({dbStorageStats ? dbStorageStats.total_db_size_pretty : '—'})
          </TabsTrigger>
          <TabsTrigger value="admins" className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            Admin Visibility ({adminStatuses.length})
          </TabsTrigger>
          <TabsTrigger value="jobs" className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-600" />
            Sync Jobs ({syncJobs.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-600" />
            Audit History ({auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* 1. Anomalies & Recursions Tab */}
        <TabsContent value="anomalies" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold text-slate-800">
                  Data Inconsistency & Recursion Diagnostics
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Monitors duplicate question entries from ALOC sync retries, incomplete question fields, and out-of-range years.
                </CardDescription>
              </div>
              {anomalies.length > 0 && (
                <Button
                  onClick={resolveAllAnomalies}
                  disabled={resolving}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Wrench className="h-3.5 w-3.5 mr-1.5" />
                  Auto-Resolve ({anomalies.length})
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {anomalies.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">No Data Inconsistencies or Recursion Loops Found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    All JAMB ALOC past questions have valid options, clean subject/year formatting, and zero duplicates.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="w-40">Severity / Type</TableHead>
                        <TableHead>Anomaly Description</TableHead>
                        <TableHead className="w-32">Subject / Year</TableHead>
                        <TableHead className="w-24 text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {anomalies.map((anom) => (
                        <TableRow key={anom.id} className="hover:bg-slate-50/80">
                          <TableCell className="align-top space-y-1">
                            {getSeverityBadge(anom.severity)}
                            <div className="text-xs font-medium text-slate-600">
                              {getTypeLabel(anom.type)}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="font-medium text-slate-800 text-sm">
                              {anom.title}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {anom.description}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-xs text-slate-600">
                            {anom.subject ? (
                              <div>
                                <span className="font-semibold">{anom.subject}</span>
                                {anom.year && <span className="text-slate-400"> ({anom.year})</span>}
                              </div>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-right font-mono text-sm">
                            {anom.count ? `${anom.count}` : '1'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. Admin Visibility Health Tab */}
        <TabsContent value="admins" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-800">
                Admin JAMB Question Access & Allocation Health
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Monitors whether synced JAMB past questions are properly assigned and visible across all Admins for user practice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adminStatuses.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border">
                  <p>No admins found with role admin or super_admin.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Admin</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Active Questions</TableHead>
                        <TableHead className="text-right">Inactive</TableHead>
                        <TableHead className="w-48">Visibility Coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adminStatuses.map((adm) => (
                        <TableRow key={adm.adminId}>
                          <TableCell className="font-medium text-slate-800">
                            {adm.name}
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm">
                            {adm.email}
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-600 font-semibold">
                            {adm.activeCount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-slate-500">
                            {adm.inactiveCount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-600 font-medium">
                                  {adm.coveragePct}%
                                </span>
                                <span className="text-slate-400">
                                  {adm.coveragePct === 100 ? 'Full Access' : 'Partial Access'}
                                </span>
                              </div>
                              <Progress value={adm.coveragePct} className="h-1.5" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. Sync Jobs & Loop Monitor Tab */}
        <TabsContent value="jobs" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-800">
                ALOC Sync Jobs & Recursion Loop Tracker
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Monitors background JAMB ALOC sync jobs for infinite retry loops, API rate limit failures, or stuck executions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {syncJobs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border">
                  <p>No recent JAMB sync jobs recorded.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Inserted / Failed</TableHead>
                        <TableHead>Message / Recent Errors</TableHead>
                        <TableHead className="text-right w-40">Started</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {syncJobs.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell>
                            <Badge
                              className={
                                j.status === 'completed'
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : j.status === 'running'
                                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                                  : j.status === 'failed'
                                  ? 'bg-red-600 text-white hover:bg-red-700'
                                  : 'bg-slate-500 text-white hover:bg-slate-600'
                              }
                            >
                              {j.status.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            <div>
                              Subject: <span className="font-medium text-slate-800">{j.current_subject || '—'}</span>
                            </div>
                            <div>
                              Year: <span className="font-medium text-slate-800">{j.current_year || '—'}</span> (Page {j.current_page})
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            <div className="text-emerald-700 font-semibold">+ {j.inserted || 0} inserted</div>
                            {(j.failed ?? 0) > 0 && <div className="text-red-600">{j.failed} failed</div>}
                          </TableCell>
                          <TableCell className="text-xs max-w-xs truncate text-slate-600">
                            <div className="font-medium text-slate-800">{j.message || '—'}</div>
                            {j.errors && j.errors.length > 0 && (
                              <div className="text-red-500 mt-0.5">
                                {j.errors.length} error(s): {j.errors[j.errors.length - 1]}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-slate-500">
                            {new Date(j.started_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. Audit & Resolution History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-800">
                Audit & Resolution History Log
              </CardTitle>
              <CardDescription className="text-sm text-slate-500">
                Historical record of all manual and automated integrity audits and anomaly resolutions logged by the Guard engine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed">
                  <FileCheck2 className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                  <p className="font-medium text-slate-700">No Audit History Recorded Yet</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click "Run Complete Audit" to perform a scan and record an entry into the audit log.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="w-40">Date & Time</TableHead>
                        <TableHead className="w-28">Source</TableHead>
                        <TableHead className="w-28 text-center">Health Score</TableHead>
                        <TableHead>Anomalies Detected</TableHead>
                        <TableHead>Actions Taken / Resolution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => {
                        const score = log.health_score;
                        return (
                          <TableRow key={log.id} className="hover:bg-slate-50/80">
                            <TableCell className="text-xs font-medium text-slate-800">
                              {new Date(log.run_at).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-slate-600 text-xs">
                                {log.trigger_source || 'manual'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                className={
                                  score >= 90
                                    ? 'bg-emerald-600 text-white'
                                    : score >= 70
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-red-600 text-white'
                                }
                              >
                                {score}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 max-w-xs">
                              {log.anomalies ? (
                                <div className="space-y-0.5 font-mono text-[11px]">
                                  {log.anomalies.duplicate_count ? (
                                    <div className="text-red-600 font-semibold">
                                      Duplicates: {String(log.anomalies.duplicate_count)}
                                    </div>
                                  ) : null}
                                  {log.anomalies.missing_answer_count ? (
                                    <div className="text-amber-600">
                                      Incomplete: {String(log.anomalies.missing_answer_count)}
                                    </div>
                                  ) : null}
                                  {log.anomalies.invalid_year_count ? (
                                    <div className="text-purple-600">
                                      Invalid Years: {String(log.anomalies.invalid_year_count)}
                                    </div>
                                  ) : null}
                                  {!log.anomalies.duplicate_count &&
                                   !log.anomalies.missing_answer_count &&
                                   !log.anomalies.invalid_year_count ? (
                                    <span className="text-emerald-600 font-medium">Clean audit</span>
                                  ) : null}
                                </div>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {log.actions_taken ? (
                                <div className="space-y-0.5 text-[11px]">
                                  {log.actions_taken.deleted_duplicates ? (
                                    <div>Deleted Dupes: <span className="font-semibold">{String(log.actions_taken.deleted_duplicates)}</span></div>
                                  ) : null}
                                  {log.actions_taken.quarantined_invalid_year ? (
                                    <div>Quarantined Years: <span className="font-semibold">{String(log.actions_taken.quarantined_invalid_year)}</span></div>
                                  ) : null}
                                  {log.actions_taken.visibility_backfilled ? (
                                    <div>Backfilled Visibility: <span className="font-semibold">{String(log.actions_taken.visibility_backfilled)}</span></div>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">No actions needed</span>
                              )}
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
        </TabsContent>

        {/* 5. Database Storage Level & Capacity Tab */}
        <TabsContent value="storage" className="mt-4">
          <div className="space-y-6">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <Database className="h-5 w-5 text-emerald-600" />
                    Database Storage Level & Target Capacity
                  </CardTitle>
                  <CardDescription className="text-sm text-slate-500">
                    Real-time database disk usage, row allocations, and question storage level progress towards the 5,000 JAMB question target.
                  </CardDescription>
                </div>
                <Button
                  onClick={fetchDatabaseStorageStats}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Refresh Storage Stats
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-100">
                    <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">
                      Total Database Disk Usage
                    </div>
                    <div className="text-3xl font-extrabold text-emerald-950 mt-1">
                      {dbStorageStats?.total_db_size_pretty || '—'}
                    </div>
                    <div className="text-xs text-emerald-700 mt-1">
                      Includes all tables, indexes, constraints, and audit logs
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                    <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                      Target Capacity Progress (5,000 Qs)
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-extrabold text-blue-950">
                        {dbStorageStats?.storage_level_pct || 0}%
                      </span>
                      <span className="text-xs font-medium text-blue-700">
                        ({dbStorageStats?.questions_count.toLocaleString() || 0} / 5,000 Questions)
                      </span>
                    </div>
                    <Progress value={dbStorageStats?.storage_level_pct || 0} className="h-2 mt-2" />
                  </div>

                  <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
                    <div className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                      Active Visibility Allocations
                    </div>
                    <div className="text-3xl font-extrabold text-purple-950 mt-1">
                      {dbStorageStats?.visibility_count.toLocaleString() || 0}
                    </div>
                    <div className="text-xs text-purple-700 mt-1">
                      Admin-to-question visibility records synchronized
                    </div>
                  </div>
                </div>

                {/* Table Breakdown */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-800 mb-3">
                    Database Table Storage Breakdown
                  </h4>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Table Name</TableHead>
                          <TableHead>Total Size</TableHead>
                          <TableHead className="text-right">Estimated Row Count</TableHead>
                          <TableHead className="text-right">Storage Share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dbStorageStats?.tables_breakdown.map((tbl) => {
                          const totalBytes = dbStorageStats.total_db_size_bytes || 1;
                          const pct = Math.min(100, Math.round(((tbl.size_bytes || 0) / totalBytes) * 100));
                          return (
                            <TableRow key={tbl.table_name}>
                              <TableCell className="font-mono text-sm font-semibold text-slate-800">
                                {tbl.table_name}
                              </TableCell>
                              <TableCell className="text-sm font-medium text-emerald-700">
                                {tbl.total_size}
                              </TableCell>
                              <TableCell className="text-right font-mono text-slate-700 text-sm">
                                {tbl.estimated_rows != null ? tbl.estimated_rows.toLocaleString() : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs font-mono text-slate-600">{pct}%</span>
                                  <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Subject Question Storage Distribution */}
                {dbStorageStats?.subject_distribution && Object.keys(dbStorageStats.subject_distribution).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 mb-3">
                      Subject Questions Storage Distribution (5,000 Target Matrix)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(dbStorageStats.subject_distribution).map(([subj, count]) => {
                        const targetPerSubj = 333; // ~5,000 / 15 subjects
                        const pctSubj = Math.min(100, Math.round((count / targetPerSubj) * 100));
                        return (
                          <div key={subj} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex justify-between items-center text-xs font-medium text-slate-700">
                              <span className="capitalize font-semibold">{subj}</span>
                              <span className="font-mono">{count} Qs</span>
                            </div>
                            <Progress value={pctSubj} className="h-1.5 mt-2" />
                            <div className="text-[10px] text-slate-400 mt-1 text-right">{pctSubj}% of target</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
