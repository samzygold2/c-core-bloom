import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Settings } from 'lucide-react';

interface AdminProfile {
  id: string;
  firstname: string;
  lastname: string;
}

export const UserSettingsDialog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState<string>('');
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchAdmins();
      fetchCurrentAdmin();
    }
  }, [open, user]);

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from('admin_profiles_public')
      .select('id, firstname, lastname');
    if (data) {
      setAdmins(data.filter((a) => a.firstname?.trim() && a.lastname?.trim()));
    }
  };

  const fetchCurrentAdmin = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('assigned_admin_id')
      .eq('id', user!.id)
      .single();
    if (data?.assigned_admin_id) {
      setCurrentAdminId(data.assigned_admin_id);
      setSelectedAdminId(data.assigned_admin_id);
    }
  };

  const handleChangeAdmin = async () => {
    if (!user || !selectedAdminId || selectedAdminId === currentAdminId) return;
    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        assigned_admin_id: selectedAdminId,
        is_pending: true,
        is_waiting: false,
      })
      .eq('id', user.id);

    setLoading(false);

    if (error) {
      toast({ title: 'Error', description: 'Failed to change admin.', variant: 'destructive' });
      return;
    }

    toast({
      title: 'Admin Changed',
      description: 'Your request has been sent. You need approval from the new admin before accessing tests.',
    });
    setCurrentAdminId(selectedAdminId);
    setOpen(false);

    // Reload to reflect pending status
    window.location.reload();
  };

  const currentAdmin = admins.find((a) => a.id === currentAdminId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
          <Settings className="mr-1 sm:mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
          <span className="sm:hidden">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {currentAdmin && (
            <p className="text-sm text-muted-foreground">
              Current admin: <span className="font-medium text-foreground">{currentAdmin.firstname} {currentAdmin.lastname}</span>
            </p>
          )}
          <div className="space-y-2">
            <Label>Change Admin</Label>
            <Select value={selectedAdminId} onValueChange={setSelectedAdminId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an admin" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {admins.map((admin) => (
                  <SelectItem key={admin.id} value={admin.id!}>
                    {admin.firstname} {admin.lastname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Changing admin will require approval. You won't be able to take tests until the new admin accepts you.
            </p>
          </div>
          <Button
            onClick={handleChangeAdmin}
            disabled={loading || !selectedAdminId || selectedAdminId === currentAdminId}
            className="w-full"
          >
            {loading ? 'Saving...' : 'Change Admin'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
