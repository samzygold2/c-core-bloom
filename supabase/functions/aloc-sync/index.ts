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
    const perBatch: number = Math.min(Math.max(body.perBatch ?? 20, 1), 40);

    let inserted = 0, updated = 0, failed = 0;
    const errors: string[] = [];

    for (const subject of subjects) {
      for (const year of years) {
        try {
          const url = `${ALOC_BASE}/m?subject=${encodeURIComponent(subject)}&year=${year}&type=utme`;
          const resp = await fetch(url, { headers: { 'AccessToken': token, 'Accept': 'application/json' } });
          if (!resp.ok) { failed++; errors.push(`${subject}/${year}: HTTP ${resp.status}`); continue; }
          const json = await resp.json();
          const items: any[] = Array.isArray(json?.data) ? json.data : [];
          for (const q of items.slice(0, perBatch)) {
            const alocId = String(q.id ?? `${subject}-${year}-${q.question?.slice(0,30)}`);
            const row = {
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
            };
            const { error, data } = await admin.from('past_questions').upsert(row, { onConflict: 'aloc_id' }).select('id');
            if (error) { failed++; errors.push(`${subject}/${year}: ${error.message}`); }
            else if (data) inserted++;
          }
        } catch (e: any) {
          failed++;
          errors.push(`${subject}/${year}: ${e.message}`);
        }
      }
    }

    return json({ success: true, inserted, updated, failed, errors: errors.slice(0, 20) }, 200);
  } catch (e: any) {
    return json({ error: e.message ?? 'Internal error' }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });
}
