import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Hash OTPs with SHA-256 so plaintext codes are never stored
async function hashOtp(otp: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(otp));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, ...params } = await req.json();
    console.log(`[reset-password] Action: ${action}`);

    switch (action) {
      case 'request_otp': {
        // Anyone can request an OTP (public endpoint)
        const { username, role } = params;
        
        if (!username || !role) {
          return new Response(
            JSON.stringify({ error: 'Username and role are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!['user', 'admin'].includes(role)) {
          return new Response(
            JSON.stringify({ error: 'Invalid role' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create a password reset request
        const { error: insertError } = await supabaseAdmin
          .from('password_reset_requests')
          .insert({ username, role, status: 'pending' });

        if (insertError) {
          console.error('[reset-password] Insert error:', insertError);
          return new Response(
            JSON.stringify({ error: 'Failed to create reset request' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[reset-password] Reset request created for ${username} (${role})`);
        return new Response(
          JSON.stringify({ 
            message: `Password reset request sent. A ${role === 'user' ? 'Admin' : 'Super Admin'} will generate an OTP for you.` 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'generate_otp': {
        // Only admins/super-admins can generate OTPs
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
          return new Response(
            JSON.stringify({ error: 'Authorization required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
          global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if user is admin or super_admin
        const { data: roleData } = await supabaseAdmin
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'super_admin']);

        if (!roleData || roleData.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Only admins can generate OTPs' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { user_id: targetUserId } = params;
        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: 'user_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if the caller is only an admin (not super_admin)
        const isOnlyAdmin = roleData.some(r => r.role === 'admin') && !roleData.some(r => r.role === 'super_admin');

        if (isOnlyAdmin) {
          // Admins cannot generate OTPs for other admins/super_admins
          const { data: targetRoles } = await supabaseAdmin
            .from('user_roles')
            .select('role')
            .eq('user_id', targetUserId)
            .in('role', ['admin', 'super_admin']);

          if (targetRoles && targetRoles.length > 0) {
            return new Response(
              JSON.stringify({ error: 'Admins cannot generate OTPs for other admins. Contact a Super Admin.' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // Invalidate any existing unused OTPs for this user
        await supabaseAdmin
          .from('password_reset_otps')
          .update({ used: true })
          .eq('user_id', targetUserId)
          .eq('used', false);

        // Store the OTP
        const { error: otpError } = await supabaseAdmin
          .from('password_reset_otps')
          .insert({
            user_id: targetUserId,
            otp_hash: await hashOtp(otp),
            expires_at: expiresAt,
            generated_by: user.id
          });


        if (otpError) {
          console.error('[reset-password] OTP insert error:', otpError);
          return new Response(
            JSON.stringify({ error: 'Failed to generate OTP' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[reset-password] OTP generated for user ${targetUserId} by admin ${user.id}`);
        return new Response(
          JSON.stringify({ 
            otp, // Send back to admin for manual delivery
            message: 'OTP generated successfully. Valid for 15 minutes.',
            expires_at: expiresAt
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'reset_password': {
        // Anyone can reset password with valid OTP (public endpoint)
        const { username, otp, new_password } = params;
        
        if (!username || !otp || !new_password) {
          return new Response(
            JSON.stringify({ error: 'Username, OTP, and new password are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (new_password.length < 6) {
          return new Response(
            JSON.stringify({ error: 'Password must be at least 6 characters' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find user by username (email format used in this app)
        const email = `${username.toLowerCase()}@cbt.local`;
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (userError) {
          console.error('[reset-password] User lookup error:', userError);
          return new Response(
            JSON.stringify({ error: 'Failed to find user' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const targetUser = userData.users.find(u => u.email === email);
        if (!targetUser) {
          return new Response(
            JSON.stringify({ error: 'User not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Find valid OTP
        const { data: otpData, error: otpError } = await supabaseAdmin
          .from('password_reset_otps')
          .select('*')
          .eq('user_id', targetUser.id)
          .eq('used', false)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (otpError || !otpData) {
          return new Response(
            JSON.stringify({ error: 'Invalid or expired OTP' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify OTP
        // Verify OTP against stored hash
        if (otpData.otp_hash !== await hashOtp(otp)) {
          return new Response(
            JSON.stringify({ error: 'Invalid OTP' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }


        // Update password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          targetUser.id,
          { password: new_password }
        );

        if (updateError) {
          console.error('[reset-password] Password update error:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update password' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Mark OTP as used
        await supabaseAdmin
          .from('password_reset_otps')
          .update({ used: true })
          .eq('id', otpData.id);

        console.log(`[reset-password] Password reset successful for user ${targetUser.id}`);
        return new Response(
          JSON.stringify({ message: 'Password reset successful. You can now login with your new password.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[reset-password] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});