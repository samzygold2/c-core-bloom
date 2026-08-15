// ALOC JAMB Past Questions Sync - super admin only
// Resumable: persists progress in public.jamb_sync_jobs so an interrupted
// run can be continued from the last (subject, year, page) it processed.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUBJECTS = ['mathematics','english','chemistry','physics','biology','economics','literature-in-english','accounting','government','commerce','geography','crk','irk','civic-education','history'];
const ALOC_BASE = 'https://questions.aloc.com.ng/api/v2';

interface SyncJob {
  id: string;
  subjects: string[];
  years: number[];
  total_per_call: number;
  pages: number;
  current_subject: string | null;
  current_year: number | null;
  current_page: number | null;
  status: string;
  inserted: number | null;
  failed: number | null;
  errors: string[] | null;
  message: string | null;
  task_retry_counts?: Record<string, number>;
  consecutive_failures?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const token = Deno.env.get('ALOC_ACCESS_TOKEN');
    if (!token) throw new Error('ALOC_ACCESS_TOKEN not configured');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isSuper = roleRows?.some((r: { role: string }) => r.role === 'super_admin');
    if (!isSuper) return json({ error: 'Forbidden: super admin only' }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? 'start'; // start | resume | status

    if (action === 'status') {
      const { data } = await admin
        .from('jamb_sync_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ success: true, job: data }, 200);
    }

    // Auto-mark stale "running" jobs (no progress for 60s) as failed so they're resumable.
    await admin
      .from('jamb_sync_jobs')
      .update({ status: 'failed', message: 'Auto-marked stale (worker stopped)' })
      .eq('status', 'running')
      .lt('updated_at', new Date(Date.now() - 60_000).toISOString());

    // Resume: pick the most recent non-completed job, else start fresh.
    let job: SyncJob | null = null;
    if (action === 'resume' || body.jobId) {
      const q = admin.from('jamb_sync_jobs').select('*');
      const { data } = body.jobId
        ? await q.eq('id', body.jobId).maybeSingle()
        : await q.in('status', ['running', 'paused', 'failed']).order('started_at', { ascending: false }).limit(1).maybeSingle();
      job = data as unknown as SyncJob;
      if (action === 'resume' && !job) {
        return json({ error: 'No previous sync to resume. Start a new one.' }, 400);
      }
    }

    if (!job) {
      // Starting a new sync — supersede any other running job.
      await admin
        .from('jamb_sync_jobs')
        .update({ status: 'failed', message: 'Superseded by new sync' })
        .eq('status', 'running');

      const subjects: string[] = body.subjects?.length ? body.subjects : SUBJECTS;
      const years: number[] = body.years?.length ? body.years : Array.from({length: 16}, (_,i) => 2009 + i);
      const total: number = Math.min(Math.max(body.total ?? 40, 1), 40);
      
      // Default to 5 pages per subject/year to hit 5,000+ target questions across 15 subjects x 16 years
      let defaultPages = 5;
      if (body.target_count === 1000 || body.targetQuestions === 1000) {
        defaultPages = 1;
      } else if (body.target_count === 5000 || body.targetQuestions === 5000) {
        defaultPages = 5;
      } else if (body.target_count === 10000 || body.targetQuestions === 10000) {
        defaultPages = 10;
      }
      
      const pages: number = Math.min(Math.max(body.pages ?? defaultPages, 1), 15);
      const { data: created, error: cErr } = await admin
        .from('jamb_sync_jobs')
        .insert({
          status: 'running',
          subjects, years,
          total_per_call: total, pages,
          current_subject: subjects[0], current_year: years[0], current_page: 0,
          started_by: userData.user.id,
          message: 'Started',
        })
        .select('*')
        .single();
      if (cErr) throw cErr;
      job = created as unknown as SyncJob;
    } else {
      await admin.from('jamb_sync_jobs').update({ status: 'running', message: 'Resumed' }).eq('id', job.id);
    }

    const runSync = async (jobId: string) => {
      // Reload fresh state
      const { data: j } = await admin.from('jamb_sync_jobs').select('*').eq('id', jobId).single();
      if (!j) return;
      const subjects: string[] = j.subjects;
      const years: number[] = j.years;
      const total: number = j.total_per_call;
      const pages: number = j.pages;

      let inserted = j.inserted ?? 0;
      let failed = j.failed ?? 0;
      let consecutiveFailures = j.consecutive_failures ?? 0;
      const taskRetryCounts: Record<string, number> = (j.task_retry_counts as Record<string, number>) ?? {};
      const errors: string[] = [...(j.errors ?? [])];
      let circuitBroken = false;

      const MAX_TASK_RETRIES = 3;
      const MAX_CONSECUTIVE_FAILURES = 10;

      const startSubjectIdx = Math.max(0, subjects.indexOf(j.current_subject));
      const startYearIdx = Math.max(0, years.indexOf(j.current_year));
      const startPage = j.current_page ?? 0;

      let lastPersist = Date.now();
      let isPersisting = false;

      const persist = async (patch: Record<string, unknown>) => {
        if (isPersisting) return;
        isPersisting = true;
        try {
          await admin.from('jamb_sync_jobs').update({
            inserted, failed,
            errors: errors.slice(-50),
            ...patch,
          }).eq('id', jobId);
          lastPersist = Date.now();
        } catch (err: unknown) {
          console.error('Failed to persist sync status:', err);
        } finally {
          isPersisting = false;
        }
      };

      // Generate all remaining (subject, year, page) combinations to process
      const tasks: { subject: string; year: number; page: number }[] = [];
      for (let si = startSubjectIdx; si < subjects.length; si++) {
        const subject = subjects[si];
        for (let yi = (si === startSubjectIdx ? startYearIdx : 0); yi < years.length; yi++) {
          const year = years[yi];
          for (let p = (si === startSubjectIdx && yi === startYearIdx ? startPage : 0); p < pages; p++) {
            tasks.push({ subject, year, page: p });
          }
        }
      }

      const totalTasks = tasks.length;
      let activeCount = 0;
      let nextTaskIndex = 0;
      const completed = new Array(totalTasks).fill(false);

      const runNext = async (): Promise<void> => {
        if (circuitBroken || nextTaskIndex >= totalTasks) return;
        const taskIdx = nextTaskIndex++;
        const { subject, year, page } = tasks[taskIdx];
        const taskKey = `${subject}:${year}:${page}`;
        activeCount++;

        try {
          const url = `${ALOC_BASE}/q/${total}?subject=${encodeURIComponent(subject)}&year=${year}&type=utme`;
          const resp = await fetch(url, { headers: { 'AccessToken': token!, 'Accept': 'application/json' } });
          if (!resp.ok) {
            failed++;
            consecutiveFailures++;
            const retries = (taskRetryCounts[taskKey] || 0) + 1;
            taskRetryCounts[taskKey] = retries;
            errors.push(`${subject}/${year} p${page}: HTTP ${resp.status} (Retry ${retries}/${MAX_TASK_RETRIES})`);

            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              circuitBroken = true;
              await persist({
                status: 'failed',
                consecutive_failures: consecutiveFailures,
                task_retry_counts: taskRetryCounts,
                message: 'Circuit breaker: too many consecutive ALOC failures. Check API status or rate limit.',
              });
              return;
            }
          } else {
            const jr = await resp.json();
            consecutiveFailures = 0;
            
            interface AlocQuestion {
              id?: number | string;
              question?: string;
              option?: {
                a?: string;
                b?: string;
                c?: string;
                d?: string;
              };
              section?: string;
              passage?: string;
              answer?: string | number;
              solution?: string;
              image?: string;
              examtype?: string;
            }

            const items: AlocQuestion[] = Array.isArray(jr?.data) ? jr.data : (jr?.data ? [jr.data] : []);

            interface PastQuestionRow {
              aloc_id: string;
              subject: string;
              year: number;
              question_text: string;
              option_a: string | null;
              option_b: string | null;
              option_c: string | null;
              option_d: string | null;
              correct_answer: string | null;
              explanation: string | null;
              image_url: string | null;
              exam_type: string;
            }

            const parseCorrectAnswer = (rawAns: unknown, optionObj?: { a?: string; b?: string; c?: string; d?: string }): string | null => {
              if (rawAns === undefined || rawAns === null || rawAns === '') return null;
              let str = String(rawAns).trim().toLowerCase();
              if (str.startsWith('option')) str = str.replace(/^option\s*/, '').trim();
              if (str.startsWith('opt')) str = str.replace(/^opt\s*/, '').trim();
              if (str.startsWith('_')) str = str.replace(/^_/, '').trim();

              if (['a', 'b', 'c', 'd', 'e'].includes(str)) return str;
              if (str === '1') return 'a';
              if (str === '2') return 'b';
              if (str === '3') return 'c';
              if (str === '4') return 'd';
              if (str === '5') return 'e';

              if (optionObj) {
                const optA = (optionObj.a ?? '').trim().toLowerCase();
                const optB = (optionObj.b ?? '').trim().toLowerCase();
                const optC = (optionObj.c ?? '').trim().toLowerCase();
                const optD = (optionObj.d ?? '').trim().toLowerCase();

                if (optA && str === optA) return 'a';
                if (optB && str === optB) return 'b';
                if (optC && str === optC) return 'c';
                if (optD && str === optD) return 'd';
              }

              const firstChar = str.charAt(0);
              if (['a', 'b', 'c', 'd', 'e'].includes(firstChar)) return firstChar;

              return str || null;
            };

            const rows: PastQuestionRow[] = [];
            for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
              const q = items[itemIdx];
              // Keep original API ID or create traceable ID without dropping items
              const rawAlocId = q.id ? String(q.id) : `${subject}-${year}-p${page}-${itemIdx}`;

              const passageText = (q.section || q.passage || '').trim();
              let fullQuestionText = q.question ?? '';
              if (passageText && !fullQuestionText.includes(passageText)) {
                fullQuestionText = `[PASSAGE / INSTRUCTION]\n${passageText}\n\n[QUESTION]\n${fullQuestionText}`;
              }

              rows.push({
                aloc_id: rawAlocId,
                subject, year,
                question_text: fullQuestionText,
                option_a: q.option?.a ?? null,
                option_b: q.option?.b ?? null,
                option_c: q.option?.c ?? null,
                option_d: q.option?.d ?? null,
                correct_answer: parseCorrectAnswer(q.answer, q.option),
                explanation: q.solution ?? null,
                image_url: q.image ?? null,
                exam_type: q.examtype ?? 'utme',
              });
            }
            if (rows.length) {
              // Direct insertion without deduplication blocking
              const { error: insertErr, data: insertData } = await admin
                .from('past_questions')
                .insert(rows)
                .select('id');
              if (insertErr) {
                failed++;
                errors.push(`${subject}/${year} p${page}: ${insertErr.message}`);
              } else if (insertData) {
                inserted += insertData.length;

                // Automatically approve synced questions for all admins and super_admins
                try {
                  const { data: adminsList } = await admin
                    .from('user_roles')
                    .select('user_id')
                    .in('role', ['admin', 'super_admin']);
                  
                  const adminIds = Array.from(new Set((adminsList || []).map((r: { user_id: string }) => r.user_id)));
                  
                  if (adminIds.length && insertData.length) {
                    const visibilityRows = [];
                    for (const q of insertData) {
                      for (const adminId of adminIds) {
                        visibilityRows.push({
                          question_id: q.id,
                          admin_id: adminId,
                          is_active: true,
                          activated_at: new Date().toISOString(),
                          updated_by: userData.user.id,
                        });
                      }
                    }
                    if (visibilityRows.length) {
                      const { error: visErr } = await admin
                        .from('question_visibility')
                        .upsert(visibilityRows, { onConflict: 'question_id,admin_id' });
                      if (visErr) {
                        console.error('Failed to upsert question visibility for synced questions:', visErr);
                      }
                    }
                  }
                } catch (visEx) {
                  console.error('Exception during auto-approval of synced questions:', visEx);
                }
              }
            }
          }
        } catch (e: unknown) {
          const errMessage = e instanceof Error ? e.message : String(e);
          failed++;
          errors.push(`${subject}/${year} p${page}: ${errMessage}`);
        } finally {
          completed[taskIdx] = true;
          activeCount--;

          // Find the first uncompleted task to advance the resumed checkpoint
          let firstUncompletedIdx = 0;
          while (firstUncompletedIdx < totalTasks && completed[firstUncompletedIdx]) {
            firstUncompletedIdx++;
          }

          const checkpointTask = firstUncompletedIdx < totalTasks ? tasks[firstUncompletedIdx] : null;

          // Throttled updates to job status
          if (Date.now() - lastPersist > 5000 || firstUncompletedIdx === totalTasks) {
            if (checkpointTask) {
              await persist({
                current_subject: checkpointTask.subject,
                current_year: checkpointTask.year,
                current_page: checkpointTask.page,
                message: `Working: ${checkpointTask.subject}/${checkpointTask.year} (Concurrent - Remaining: ${totalTasks - firstUncompletedIdx})`,
              });
            }
          }

          // Fetch next
          await runNext();
        }
      };

      try {
        const CONCURRENCY = 6;
        const workers = [];
        for (let i = 0; i < Math.min(CONCURRENCY, totalTasks); i++) {
          workers.push(runNext());
        }
        await Promise.all(workers);

        await persist({
          status: 'completed',
          current_subject: subjects[subjects.length - 1],
          current_year: years[years.length - 1],
          current_page: pages,
          finished_at: new Date().toISOString(),
          message: `Completed. Inserted ${inserted}, failed ${failed}.`,
        });
      } catch (e: unknown) {
        const errMessage = e instanceof Error ? e.message : String(e);
        await persist({
          status: 'failed',
          message: `Stopped: ${errMessage}. Use Resume to continue.`,
        });
      }
    };

    // @ts-expect-error - EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(runSync(job.id));
    return json({ success: true, status: 'started', jobId: job.id, message: 'Sync running. Poll status to track progress.' }, 202);
  } catch (e: unknown) {
    const errMessage = e instanceof Error ? e.message : String(e);
    return json({ error: errMessage ?? 'Internal error' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
}
