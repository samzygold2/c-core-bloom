import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Settings, Plus, Trash2, Clock, CheckCircle2, Star, Upload, User as UserIcon } from 'lucide-react';

interface AdminProfile {
  id: string;
  firstname: string;
  lastname: string;
}

interface AdminLink {
  id: string;
  admin_id: string;
  status: string;
  isPrimary: boolean;
  admin?: AdminProfile;
}

// Resize an image file to a 500x500 JPEG/PNG blob via canvas
const resizeImage = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        // Cover-fit: crop center square then scale
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 500, 500);
        const isPng = file.type === 'image/png';
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Resize failed'))),
          isPng ? 'image/png' : 'image/jpeg',
          0.9,
        );
      };
      img.onerror = () => reject(new Error('Invalid image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsDataURL(file);
  });

export const UserSettingsDialog = ({ triggerVariant = 'default' }: { triggerVariant?: 'default' | 'sidebar' }) => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin management state (regular users)
  const [allAdmins, setAllAdmins] = useState<AdminProfile[]>([]);
  const [adminLinks, setAdminLinks] = useState<AdminLink[]>([]);
  const [primaryAdminId, setPrimaryAdminId] = useState<string>('');
  const [adminToAdd, setAdminToAdd] = useState<string>('');

  // Profile state
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchProfile();
      if (!isAdmin) {
        fetchAdmins();
        fetchAdminLinks();
      }
    }
  }, [open, user, isAdmin]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('firstname, lastname, assigned_admin_id, avatar_url, description')
      .eq('id', user!.id)
      .single();
    if (data) {
      setFirstname(data.firstname || '');
      setLastname(data.lastname || '');
      setPrimaryAdminId(data.assigned_admin_id || '');
      setAvatarUrl((data as any).avatar_url || '');
      setDescription((data as any).description || '');
    }
  };

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from('admin_profiles_public')
      .select('id, firstname, lastname');
    if (data) {
      setAllAdmins(
        data.filter((a) => a.firstname?.trim() && a.lastname?.trim()) as AdminProfile[]
      );
    }
  };

  const fetchAdminLinks = async () => {
    const { data: links } = await supabase
      .from('user_admins')
      .select('id, admin_id, status')
      .eq('user_id', user!.id);

    const { data: profile } = await supabase
      .from('profiles')
      .select('assigned_admin_id, is_pending')
      .eq('id', user!.id)
      .single();

    const list: AdminLink[] = (links || []).map((l) => ({ ...l, isPrimary: false }));

    if (profile?.assigned_admin_id && !list.find((l) => l.admin_id === profile.assigned_admin_id)) {
      list.unshift({
        id: 'primary',
        admin_id: profile.assigned_admin_id,
        status: profile.is_pending ? 'pending' : 'approved',
        isPrimary: true,
      });
    } else {
      list.forEach((l) => {
        l.isPrimary = l.admin_id === profile?.assigned_admin_id;
      });
    }

    setAdminLinks(list);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      toast({ title: 'Invalid format', description: 'Only JPG and PNG images are allowed.', variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please upload an image under 10MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: `image/${ext}` });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl } as any)
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast({ title: 'Profile picture updated', description: 'Your new photo is saved.' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Try again.', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !firstname.trim() || !lastname.trim()) return;
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        description: description.trim(),
      } as any)
      .eq('id', user.id);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to update profile.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Profile Updated', description: 'Your profile has been saved.' });
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
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleAddAdmin = async () => {
    if (!user || !adminToAdd) return;
    if (adminLinks.find((l) => l.admin_id === adminToAdd)) {
      toast({ title: 'Already requested', description: 'You already have this admin in your list.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('user_admins')
      .insert({ user_id: user.id, admin_id: adminToAdd, status: 'pending' });
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to add admin.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Request Sent', description: 'Awaiting approval from the admin before tests appear.' });
    setAdminToAdd('');
    fetchAdminLinks();
  };

  const handleRemoveAdmin = async (link: AdminLink) => {
    if (!user) return;
    if (link.isPrimary) {
      toast({
        title: 'Cannot remove primary admin',
        description: 'Use "Change Admin" below to change your primary admin instead.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('user_admins')
      .delete()
      .eq('id', link.id)
      .eq('user_id', user.id);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to remove admin.', variant: 'destructive' });
      return;
    }
    toast({ title: 'Admin Removed', description: 'You will no longer see their tests.' });
    fetchAdminLinks();
  };

  const handleChangePrimary = async (newPrimaryId: string) => {
    if (!user || !newPrimaryId || newPrimaryId === primaryAdminId) return;
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ assigned_admin_id: newPrimaryId, is_pending: true, is_waiting: false })
      .eq('id', user.id);
    setLoading(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to change primary admin.', variant: 'destructive' });
      return;
    }
    toast({
      title: 'Primary Admin Changed',
      description: 'Your request has been sent. You need approval from the new admin before accessing their tests.',
    });
    setPrimaryAdminId(newPrimaryId);
    setOpen(false);
    window.location.reload();
  };

  const adminName = (id: string) => {
    const a = allAdmins.find((x) => x.id === id);
    return a ? `${a.firstname} ${a.lastname}` : 'Unknown admin';
  };

  const availableAdminsToAdd = allAdmins.filter(
    (a) => !adminLinks.find((l) => l.admin_id === a.id)
  );

  const initials = `${firstname?.[0] || ''}${lastname?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {triggerVariant === 'sidebar' ? (
          <Button variant="ghost" size="sm" className="w-full justify-center gap-3 text-muted-foreground">
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
          {/* Profile Picture */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Profile Picture</h3>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-border">
                <AvatarImage src={avatarUrl} alt="Profile" />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {initials !== 'U' ? initials : <UserIcon className="h-8 w-8" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Uploading...' : avatarUrl ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  JPG or PNG. Auto-resized to 500×500.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Profile Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Profile Information</h3>
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
            <div className="space-y-1.5">
              <Label className="text-xs">About Me</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="Tell others a bit about yourself..."
                rows={3}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {description.length}/500
              </p>
            </div>
            <Button
              onClick={handleSaveProfile}
              disabled={loading || !firstname.trim() || !lastname.trim()}
              size="sm"
              className="w-full"
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>

          <Separator />

          {/* Change Password */}
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

          {/* Admin management — users only */}
          {!isAdmin && (
            <>
              <Separator />
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">My Admins</h3>
                  <p className="text-[11px] text-muted-foreground">
                    You can be linked to multiple admins. You'll see tests from every approved admin.
                  </p>
                </div>

                <div className="space-y-2">
                  {adminLinks.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No admins linked yet.</p>
                  ) : (
                    adminLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {link.isPrimary && (
                            <Star className="h-3.5 w-3.5 text-primary shrink-0" fill="currentColor" />
                          )}
                          <span className="text-sm font-medium truncate">{adminName(link.admin_id)}</span>
                          {link.status === 'approved' ? (
                            <Badge variant="secondary" className="gap-1 shrink-0">
                              <CheckCircle2 className="h-3 w-3" />
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 shrink-0 border-amber-500 text-amber-600">
                              <Clock className="h-3 w-3" />
                              Pending
                            </Badge>
                          )}
                        </div>
                        {!link.isPrimary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveAdmin(link)}
                            disabled={loading}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Add another admin</Label>
                  <div className="flex gap-2">
                    <Select value={adminToAdd} onValueChange={setAdminToAdd}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={availableAdminsToAdd.length ? 'Select an admin' : 'No more admins available'} />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {availableAdminsToAdd.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.firstname} {admin.lastname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddAdmin}
                      disabled={loading || !adminToAdd}
                      size="sm"
                      className="gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Add Admin
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    The admin must approve your request before their tests appear.
                  </p>
                </div>

                {adminLinks.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs">Change Primary Admin</Label>
                    <Select value={primaryAdminId} onValueChange={handleChangePrimary}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select primary admin" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {allAdmins.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.firstname} {admin.lastname}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Changing your primary admin requires approval from the new admin.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
