// ALOC JAMB Past Questions Sync - super admin only
// Resumable: persists progress in public.jamb_sync_jobs so an interrupted
// run can be continued from the last (subject, year, page) it processed.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUBJECTS = ['mathematics','english','chemistry','physics','biology','economics','literature-in-english','accounting'];
const ALOC_BASE = 'https://questions.aloc.com.ng/api/v2';

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
    const isSuper = roleRows?.some((r: any) => r.role === 'super_admin');
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
    let job: any = null;
    if (action === 'resume' || body.jobId) {
      const q = admin.from('jamb_sync_jobs').select('*');
      const { data } = body.jobId
        ? await q.eq('id', body.jobId).maybeSingle()
        : await q.in('status', ['running', 'paused', 'failed']).order('started_at', { ascending: false }).limit(1).maybeSingle();
      job = data;
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
      const pages: number = Math.min(Math.max(body.pages ?? 1, 1), 5);
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
      job = created;
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
      const errors: string[] = [...(j.errors ?? [])];

      const startSubjectIdx = Math.max(0, subjects.indexOf(j.current_subject));
      const startYearIdx = Math.max(0, years.indexOf(j.current_year));
      let startPage = j.current_page ?? 0;

      let lastPersist = Date.now();
      const persist = async (patch: Record<string, unknown>) => {
        await admin.from('jamb_sync_jobs').update({
          inserted, failed,
          errors: errors.slice(-50),
          ...patch,
        }).eq('id', jobId);
        lastPersist = Date.now();
      };

      try {
        for (let si = startSubjectIdx; si < subjects.length; si++) {
          const subject = subjects[si];
          for (let yi = (si === startSubjectIdx ? startYearIdx : 0); yi < years.length; yi++) {
            const year = years[yi];
            for (let p = (si === startSubjectIdx && yi === startYearIdx ? startPage : 0); p < pages; p++) {
              try {
                const url = `${ALOC_BASE}/q/${total}?subject=${encodeURIComponent(subject)}&year=${year}&type=utme`;
                const resp = await fetch(url, { headers: { 'AccessToken': token!, 'Accept': 'application/json' } });
                if (!resp.ok) {
                  failed++;
                  errors.push(`${subject}/${year} p${p}: HTTP ${resp.status}`);
                } else {
                  const jr = await resp.json();
                  const items: any[] = Array.isArray(jr?.data) ? jr.data : (jr?.data ? [jr.data] : []);
                  const rows: any[] = [];
                  const seen = new Set<string>();
                  for (const q of items) {
                    const alocId = String(q.id ?? `${subject}-${year}-${(q.question ?? '').slice(0, 60)}`);
                    if (seen.has(alocId)) continue;
                    seen.add(alocId);
                    rows.push({
                      aloc_id: alocId,
                      subject, year,
                      question_text: q.question ?? '',
                      option_a: q.option?.a ?? null,
                      option_b: q.option?.b ?? null,
                      option_c: q.option?.c ?? null,
                      option_d: q.option?.d ?? null,
                      correct_answer: (q.answer ?? '').toString().toLowerCase() || null,
                      explanation: q.solution ?? null,
                      image_url: q.image ?? null,
                      exam_type: q.examtype ?? 'utme',
                    });
                  }
                  if (rows.length) {
                    const { error, data } = await admin
                      .from('past_questions')
                      .upsert(rows, { onConflict: 'aloc_id' })
                      .select('id');
                    if (error) { failed++; errors.push(`${subject}/${year} p${p}: ${error.message}`); }
                    else if (data) inserted += data.length;
                  }
                }
              } catch (e: any) {
                failed++;
                errors.push(`${subject}/${year} p${p}: ${e.message}`);
              }

              // Persist progress every ~5s so a crash/timeout is resumable.
              if (Date.now() - lastPersist > 5000) {
                await persist({
                  current_subject: subject,
                  current_year: year,
                  current_page: p + 1,
                  message: `Working ${subject}/${year} page ${p + 1}`,
                });
              }
            }
          }
        }
        await persist({
          status: 'completed',
          current_subject: subjects[subjects.length - 1],
          current_year: years[years.length - 1],
          current_page: pages,
          finished_at: new Date().toISOString(),
          message: `Completed. Inserted ${inserted}, failed ${failed}.`,
        });
      } catch (e: any) {
        await persist({
          status: 'failed',
          message: `Stopped: ${e.message}. Use Resume to continue.`,
        });
      }
    };

    // @ts-ignore - EdgeRuntime is provided by Supabase runtime
    EdgeRuntime.waitUntil(runSync(job.id));
    return json({ success: true, status: 'started', jobId: job.id, message: 'Sync running. Poll status to track progress.' }, 202);
  } catch (e: any) {
    return json({ error: e.message ?? 'Internal error' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
}
