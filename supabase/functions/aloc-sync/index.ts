// ALOC JAMB Past Questions Sync - super admin only
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
    const subjects: string[] = body.subjects?.length ? body.subjects : SUBJECTS;
    const years: number[] = body.years?.length ? body.years : Array.from({length: 16}, (_,i) => 2009 + i);
    // ALOC /q endpoint returns multiple questions; total max ~40 per call
    const total: number = Math.min(Math.max(body.total ?? 40, 1), 40);
    // Optional: number of pages per (subject, year) to fetch (each call returns up to `total`)
    const pages: number = Math.min(Math.max(body.pages ?? 1, 1), 5);
    // If true, run the sync in the background and return immediately
    const background: boolean = body.background !== false;

    const runSync = async () => {
      let inserted = 0, failed = 0;
      const errors: string[] = [];
      const seen = new Set<string>();

      for (const subject of subjects) {
        for (const year of years) {
          for (let p = 0; p < pages; p++) {
            try {
              // /q returns a batch of random questions for the subject/year
              const url = `${ALOC_BASE}/q/${total}?subject=${encodeURIComponent(subject)}&year=${year}&type=utme`;
              const resp = await fetch(url, { headers: { 'AccessToken': token, 'Accept': 'application/json' } });
              if (!resp.ok) {
                failed++;
                errors.push(`${subject}/${year} p${p}: HTTP ${resp.status}`);
                continue;
              }
              const j = await resp.json();
              const items: any[] = Array.isArray(j?.data) ? j.data : (j?.data ? [j.data] : []);
              if (!items.length) {
                errors.push(`${subject}/${year} p${p}: empty`);
                continue;
              }
              const rows = [];
              for (const q of items) {
                const alocId = String(q.id ?? `${subject}-${year}-${(q.question ?? '').slice(0, 60)}`);
                if (seen.has(alocId)) continue;
                seen.add(alocId);
                rows.push({
                  aloc_id: alocId,
                  subject,
                  year,
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
            } catch (e: any) {
              failed++;
              errors.push(`${subject}/${year} p${p}: ${e.message}`);
            }
          }
        }
      }
      console.log(`[aloc-sync] done. inserted=${inserted} failed=${failed}`);
      if (errors.length) console.log(`[aloc-sync] first errors:`, errors.slice(0, 10));
      return { inserted, failed, errors: errors.slice(0, 20) };
    };

    if (background) {
      // @ts-ignore - EdgeRuntime is provided by Supabase runtime
      EdgeRuntime.waitUntil(runSync());
      return json({ success: true, status: 'started', message: 'Sync running in background. Refresh question list in 1-3 minutes.' }, 202);
    }

    const result = await runSync();
    return json({ success: true, ...result }, 200);
  } catch (e: any) {
    return json({ error: e.message ?? 'Internal error' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
}
