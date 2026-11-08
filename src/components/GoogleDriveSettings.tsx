import { useState } from 'react';
import { Link } from 'react-router-dom';
import { HardDrive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { googleSignIn } from '@/lib/googleAuth';
import { useGoogleDriveConnection } from '@/hooks/use-google-drive-connection';
import { useToast } from '@/hooks/use-toast';

export function GoogleDriveSettings() {
  const { connected, loading } = useGoogleDriveConnection();
  const [connecting, setConnecting] = useState(false);
  const { toast } = useToast();
  const connect = async () => {
    setConnecting(true);
    try {
      const result = await googleSignIn();
      if (result) toast({ title: 'Google Drive connected', description: result.user.email || 'Connected to your account.' });
    } catch (error) {
      toast({ title: 'Could not connect Google Drive', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally { setConnecting(false); }
  };
  return <div className="space-y-3">
    <h3 className="text-sm font-semibold">Google Drive</h3>
    {connected ? <Button asChild variant="outline" className="w-full gap-2"><Link to="/drive"><HardDrive className="h-4 w-4" />Open my Google Drive</Link></Button>
      : <Button onClick={connect} disabled={loading || connecting} variant="outline" className="w-full gap-2">
        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
        {connecting ? 'Connecting…' : 'Register my Google account'}
      </Button>}
  </div>;
}