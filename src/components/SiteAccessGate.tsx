import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Lock } from 'lucide-react';

type Area = 'admin' | 'user';

export const SiteAccessGate = ({ area, children }: { area: Area; children: ReactNode }) => {
  const [state, setState] = useState<'loading' | 'open' | 'closed'>('loading');

  useEffect(() => {
    (supabase.rpc as any)('get_site_access').then(({ data }: { data: any }) => {
      const off = area === 'admin' ? data?.admin_disabled : data?.user_disabled;
      setState(off ? 'closed' : 'open');
    }, () => setState('open'));
  }, [area]);

  if (state === 'loading') return null;
  if (state === 'open') return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-3">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-semibold text-foreground">Temporarily unavailable</h1>
        <p className="text-muted-foreground">
          {area === 'admin' ? 'Admin pages' : 'Student pages'} have been turned off by the administrator. Please check back later.
        </p>
      </div>
    </div>
  );
};
