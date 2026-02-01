import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Search, UserMinus, User, Mail, Calendar, Clock, UserPlus, UserCheck, UserX } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface UserProfile {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  created_at: string;
  assigned_admin_id: string | null;
  is_waiting: boolean;
  is_pending: boolean;
}

export const AssignedUsersManager = () => {
  const [assignedUsers, setAssignedUsers] = useState<UserProfile[]>([]);
  const [waitingUsers, setWaitingUsers] = useState<UserProfile[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchUsers();
    }
  }, [user]);

  const fetchUsers = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch users assigned to this admin (approved)
    const { data: assigned, error: assignedError } = await supabase
      .from('profiles')
      .select('id, firstname, lastname, email, created_at, assigned_admin_id, is_waiting, is_pending')
      .eq('assigned_admin_id', user.id)
      .eq('is_waiting', false)
      .eq('is_pending', false)
      .order('created_at', { ascending: false });

    if (assignedError) {
      console.error('Error fetching assigned users:', assignedError);
    } else {
      setAssignedUsers(assigned || []);
    }

    // Fetch pending approval requests for this admin
    const { data: pending, error: pendingError } = await supabase
      .from('profiles')
      .select('id, firstname, lastname, email, created_at, assigned_admin_id, is_waiting, is_pending')
      .eq('assigned_admin_id', user.id)
      .eq('is_pending', true)
      .order('created_at', { ascending: false });

    if (pendingError) {
      console.error('Error fetching pending users:', pendingError);
    } else {
      setPendingUsers(pending || []);
    }

    // Fetch waiting list users (rejected or removed - available for any admin)
    const { data: waiting, error: waitingError } = await supabase
      .from('profiles')
      .select('id, firstname, lastname, email, created_at, assigned_admin_id, is_waiting, is_pending')
      .eq('is_waiting', true)
      .order('created_at', { ascending: false });

    if (waitingError) {
      console.error('Error fetching waiting users:', waitingError);
    } else {
      setWaitingUsers(waiting || []);
    }

    setLoading(false);
  };

  const handleRemoveUser = (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    setShowRemoveDialog(true);
  };

  const handleRejectUser = (userProfile: UserProfile) => {
    setSelectedUser(userProfile);
    setShowRejectDialog(true);
  };

  const confirmRemoveUser = async () => {
    if (!selectedUser || !user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        assigned_admin_id: null, 
        is_waiting: true,
        is_pending: false
      })
      .eq('id', selectedUser.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove user',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'User Removed',
      description: `${selectedUser.firstname} ${selectedUser.lastname} has been moved to the waiting list`,
    });

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action: `Removed user ${selectedUser.firstname} ${selectedUser.lastname} to waiting list`,
    });

    setShowRemoveDialog(false);
    setSelectedUser(null);
    fetchUsers();
  };

  const confirmRejectUser = async () => {
    if (!selectedUser || !user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        assigned_admin_id: null, 
        is_waiting: true,
        is_pending: false
      })
      .eq('id', selectedUser.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject user',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'User Rejected',
      description: `${selectedUser.firstname} ${selectedUser.lastname} has been moved to the waiting list`,
    });

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action: `Rejected user request from ${selectedUser.firstname} ${selectedUser.lastname}`,
    });

    setShowRejectDialog(false);
    setSelectedUser(null);
    fetchUsers();
  };

  const handleAcceptUser = async (userProfile: UserProfile) => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        assigned_admin_id: user.id,
        is_pending: false,
        is_waiting: false
      })
      .eq('id', userProfile.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to accept user',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'User Accepted',
      description: `${userProfile.firstname} ${userProfile.lastname} is now assigned to you`,
    });

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action: `Accepted user ${userProfile.firstname} ${userProfile.lastname}`,
    });

    fetchUsers();
  };

  const handleAssignFromWaitlist = async (userProfile: UserProfile) => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        assigned_admin_id: user.id, 
        is_waiting: false,
        is_pending: false
      })
      .eq('id', userProfile.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign user',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'User Assigned',
      description: `${userProfile.firstname} ${userProfile.lastname} has been assigned to you`,
    });

    await supabase.from('audit_log').insert({
      admin_id: user.id,
      action: `Assigned user ${userProfile.firstname} ${userProfile.lastname} from waiting list`,
    });

    fetchUsers();
  };

  const filteredAssigned = assignedUsers.filter(u =>
    `${u.firstname} ${u.lastname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPending = pendingUsers.filter(u =>
    `${u.firstname} ${u.lastname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWaiting = waitingUsers.filter(u =>
    `${u.firstname} ${u.lastname}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const UserCard = ({ userProfile, showRemove = false, showAssign = false, showAcceptReject = false }: { 
    userProfile: UserProfile; 
    showRemove?: boolean;
    showAssign?: boolean;
    showAcceptReject?: boolean;
  }) => (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{userProfile.firstname} {userProfile.lastname}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="break-all">{userProfile.email}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Joined {new Date(userProfile.created_at).toLocaleDateString()}
            </div>

            {userProfile.is_pending && (
              <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                <Clock className="h-3 w-3" />
                Pending Approval
              </Badge>
            )}

            {userProfile.is_waiting && (
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                Waiting for assignment
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {showAcceptReject && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleAcceptUser(userProfile)}
                  className="gap-1"
                >
                  <UserCheck className="h-4 w-4" />
                  Accept
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRejectUser(userProfile)}
                  className="gap-1"
                >
                  <UserX className="h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
            {showRemove && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRemoveUser(userProfile)}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
            {showAssign && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleAssignFromWaitlist(userProfile)}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Assign to Me
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">My Assigned Users</h2>
          <p className="text-sm text-muted-foreground">Manage users assigned to you</p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3 sm:py-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Search className="h-5 w-5" />
            Search Users
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="pending" className="flex-1 min-w-[100px] text-xs sm:text-sm">
            Pending ({pendingUsers.length})
          </TabsTrigger>
          <TabsTrigger value="assigned" className="flex-1 min-w-[100px] text-xs sm:text-sm">
            My Users ({assignedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="waiting" className="flex-1 min-w-[100px] text-xs sm:text-sm">
            Waiting List ({waitingUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {filteredPending.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No pending approval requests
              </CardContent>
            </Card>
          ) : (
            filteredPending.map((userProfile) => (
              <UserCard key={userProfile.id} userProfile={userProfile} showAcceptReject />
            ))
          )}
        </TabsContent>

        <TabsContent value="assigned" className="space-y-4">
          {filteredAssigned.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No users assigned to you yet
              </CardContent>
            </Card>
          ) : (
            filteredAssigned.map((userProfile) => (
              <UserCard key={userProfile.id} userProfile={userProfile} showRemove />
            ))
          )}
        </TabsContent>

        <TabsContent value="waiting" className="space-y-4">
          {filteredWaiting.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No users in the waiting list
              </CardContent>
            </Card>
          ) : (
            filteredWaiting.map((userProfile) => (
              <UserCard key={userProfile.id} userProfile={userProfile} showAssign />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Remove User Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedUser?.firstname} {selectedUser?.lastname} from your assigned users? 
              They will be moved to the waiting list where other admins can assign them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject User Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject User Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject {selectedUser?.firstname} {selectedUser?.lastname}'s request? 
              They will be moved to the waiting list where other admins can assign them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRejectUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reject Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
