import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type Access = { admin_disabled: boolean; user_disabled: boolean };

export const SiteAccessControl = () => {
  const { toast } = useToast();
  const [access, setAccess] = useState<Access>({ admin_disabled: false, user_disabled: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('system_config').select('value').eq('key', 'site_access').maybeSingle()
      .then(({ data }) => data?.value && setAccess({ admin_disabled: false, user_disabled: false, ...(data.value as any) }));
  }, []);

  const save = async (next: Access) => {
    const prev = access;
    setAccess(next);
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('system_config').upsert(
      { key: 'site_access', value: next as any, description: 'Turn admin and user pages off', updated_by: user?.id, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    setSaving(false);
    if (error) {
      setAccess(prev);
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Page access updated' });
    }
  };

  const rows = [
    { id: 'admin', label: 'Deactivate admin pages', desc: 'Admins cannot sign in or open the admin panel.', checked: access.admin_disabled, next: { ...access, admin_disabled: !access.admin_disabled } },
    { id: 'user', label: 'Deactivate user pages', desc: 'Students cannot sign in, take tests, view results or practise JAMB.', checked: access.user_disabled, next: { ...access, user_disabled: !access.user_disabled } },
    { id: 'both', label: 'Deactivate both', desc: 'Turn off admin and user pages together.', checked: access.admin_disabled && access.user_disabled, next: { admin_disabled: !(access.admin_disabled && access.user_disabled), user_disabled: !(access.admin_disabled && access.user_disabled) } },
  ];

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Page Access</CardTitle>
        <CardDescription>Switch on to deactivate pages. Super admin pages are never affected.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor={`access-${r.id}`} className="font-medium">{r.label}</Label>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </div>
            <Switch id={`access-${r.id}`} checked={r.checked} disabled={saving} onCheckedChange={() => save(r.next)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
