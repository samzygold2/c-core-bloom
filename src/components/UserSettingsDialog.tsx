import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Settings } from 'lucide-react';

interface AdminProfile {
  id: string;
  firstname: string;
  lastname: string;
}

export const UserSettingsDialog = ({ triggerVariant = 'default' }: { triggerVariant?: 'default' | 'sidebar' }) => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Change admin state (for regular users)
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [currentAdminId, setCurrentAdminId] = useState<string>('');
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');

  // Name change state
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchProfile();
      if (!isAdmin) {
        fetchAdmins();
        fetchCurrentAdmin();
      }
    }
  }, [open, user, isAdmin]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('firstname, lastname')
      .eq('id', user!.id)
      .single();
    if (data) {
      setFirstname(data.firstname || '');
      setLastname(data.lastname || '');
    }
  };

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

  const handleChangeName = async () => {
    if (!user || !firstname.trim() || !lastname.trim()) return;
    setLoading(true);

    const { error } = await supabase
      .from('profiles')
      .update({ firstname: firstname.trim(), lastname: lastname.trim() })
      .eq('id', user.id);

    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to update name.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Name Updated', description: 'Your name has been changed successfully.' });
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password Updated', description: 'Your password has been changed successfully.' });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
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
    window.location.reload();
  };

  const currentAdmin = admins.find((a) => a.id === currentAdminId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === 'sidebar' ? (
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3 text-muted-foreground">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
            <Settings className="mr-1 sm:mr-2 h-4 w-4" />
            Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {/* Change Name Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Change Name</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={firstname} onChange={(e) => setFirstname(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={lastname} onChange={(e) => setLastname(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleChangeName} disabled={loading || !firstname.trim() || !lastname.trim()} size="sm" className="w-full">
              {loading ? 'Saving...' : 'Update Name'}
            </Button>
          </div>

          <Separator />

          {/* Change Password Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Change Password</h3>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-xs">New Password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Confirm New Password</Label>
                <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" />
              </div>
            </div>
            <Button onClick={handleChangePassword} disabled={loading || !newPassword || !confirmPassword} size="sm" className="w-full">
              {loading ? 'Saving...' : 'Update Password'}
            </Button>
          </div>

          {/* Change Admin Section - only for regular users */}
          {!isAdmin && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Change Admin</h3>
                {currentAdmin && (
                  <p className="text-xs text-muted-foreground">
                    Current admin: <span className="font-medium text-foreground">{currentAdmin.firstname} {currentAdmin.lastname}</span>
                  </p>
                )}
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
                <p className="text-[10px] text-muted-foreground">
                  Changing admin will require approval. You won't be able to take tests until the new admin accepts you.
                </p>
                <Button
                  onClick={handleChangeAdmin}
                  disabled={loading || !selectedAdminId || selectedAdminId === currentAdminId}
                  size="sm"
                  className="w-full"
                >
                  {loading ? 'Saving...' : 'Change Admin'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
