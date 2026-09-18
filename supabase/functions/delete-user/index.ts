import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const isUuid = (v: unknown) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerRole } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();

    if (!callerRole) return json({ error: 'Requires super_admin role' }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId;
    if (!isUuid(userId)) return json({ error: 'Invalid userId' }, 400);
    if (userId === user.id) return json({ error: 'You cannot delete your own account' }, 400);

    const { data: targetRoles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if ((targetRoles || []).some((r: { role: string }) => r.role === 'super_admin')) {
      return json({ error: 'Super admin accounts cannot be deleted here' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('email, firstname, lastname')
      .eq('id', userId)
      .maybeSingle();

    // Clean up dependent rows that do not cascade
    await admin.from('user_admins').delete().eq('user_id', userId);
    await admin.from('user_admins').delete().eq('admin_id', userId);
    await admin.from('profiles').update({ assigned_admin_id: null }).eq('assigned_admin_id', userId);
    await admin.from('user_roles').delete().eq('user_id', userId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('deleteUser failed:', deleteError);
      return json({ error: deleteError.message }, 400);
    }

    await admin.from('audit_log').insert({
      admin_id: user.id,
      action: `Deleted account ${profile?.email ?? userId} (${profile?.firstname ?? ''} ${profile?.lastname ?? ''})`.trim(),
    });

    return json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Error in delete-user function:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
