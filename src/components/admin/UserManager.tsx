import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, UserPlus, Shield, UserX, User, Mail, Calendar } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

interface UserRole {
  role: string;
}

interface UserWithRoles extends UserProfile {
  roles: string[];
}

export const UserManager = () => {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserWithRoles[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [newRole, setNewRole] = useState<'admin' | 'moderator' | 'user'>('user');
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter]);

  const fetchUsers = async () => {
    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, email, created_at')
      .order('created_at', { ascending: false });

    if (profilesError) {
      toast({
        title: 'Error',
        description: 'Failed to fetch users',
        variant: 'destructive',
      });
      return;
    }

    if (!profiles) return;

    // Fetch all user roles
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
    }

    // Combine profiles with roles
    const usersWithRoles: UserWithRoles[] = profiles.map(profile => {
      const roles = userRoles
        ?.filter(ur => ur.user_id === profile.id)
        .map(ur => ur.role) || ['user'];
      
      return {
        ...profile,
        roles: roles.length > 0 ? roles : ['user']
      };
    });

    setUsers(usersWithRoles);
  };

  const filterUsers = () => {
    let filtered = users;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.roles.includes(roleFilter));
    }

    setFilteredUsers(filtered);
  };

  const handleAssignRole = (user: UserWithRoles) => {
    setSelectedUser(user);
    setNewRole('user');
    setShowRoleDialog(true);
  };

  const confirmAssignRole = async () => {
    if (!selectedUser) return;

    // Check if user already has this role
    if (selectedUser.roles.includes(newRole)) {
      toast({
        title: 'Info',
        description: `User already has ${newRole} role`,
      });
      setShowRoleDialog(false);
      return;
    }

    const { error } = await supabase
      .from('user_roles')
      .insert({
        user_id: selectedUser.id,
        role: newRole as any
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign role',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: `${newRole} role assigned to ${selectedUser.username}`,
    });

    await supabase.from('audit_log').insert({
      admin_id: (await supabase.auth.getUser()).data.user?.id,
      action: `Assigned ${newRole} role to user ${selectedUser.username}`,
    });

    setShowRoleDialog(false);
    fetchUsers();
  };

  const handleRemoveRole = async (user: UserWithRoles, role: string) => {
    if (role === 'user') {
      toast({
        title: 'Info',
        description: 'Cannot remove default user role',
      });
      return;
    }

    if (!confirm(`Remove ${role} role from ${user.username}?`)) {
      return;
    }

    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', user.id)
      .eq('role', role as any);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove role',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Success',
      description: `${role} role removed from ${user.username}`,
    });

    await supabase.from('audit_log').insert({
      admin_id: (await supabase.auth.getUser()).data.user?.id,
      action: `Removed ${role} role from user ${user.username}`,
    });

    fetchUsers();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-destructive text-destructive-foreground';
      case 'moderator':
        return 'bg-primary text-primary-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">View and manage user accounts and roles</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter Users
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Search by Username or Email</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <Label>Filter by Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Showing {filteredUsers.length} of {users.length} users
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {filteredUsers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No users found
            </CardContent>
          </Card>
        ) : (
          filteredUsers.map((user) => (
            <Card key={user.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-primary/10 p-2">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{user.username}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Joined {new Date(user.created_at).toLocaleDateString()}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {user.roles.map((role) => (
                        <Badge
                          key={role}
                          className={getRoleBadgeColor(role)}
                        >
                          {role}
                          {role !== 'user' && (
                            <button
                              onClick={() => handleRemoveRole(user, role)}
                              className="ml-2 hover:text-destructive"
                            >
                              ×
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAssignRole(user)}
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Assign Role
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AlertDialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign Role to {selectedUser?.username}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Select Role</Label>
                  <Select value={newRole} onValueChange={(value: any) => setNewRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm space-y-2">
                  <p className="font-medium">Role Permissions:</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {newRole === 'admin' && (
                      <>
                        <li>Full access to admin panel</li>
                        <li>Manage tests and questions</li>
                        <li>View analytics and audit logs</li>
                        <li>Manage user roles</li>
                      </>
                    )}
                    {newRole === 'moderator' && (
                      <>
                        <li>Limited admin panel access</li>
                        <li>Manage questions</li>
                        <li>View basic analytics</li>
                      </>
                    )}
                    {newRole === 'user' && (
                      <>
                        <li>Take tests</li>
                        <li>View own results</li>
                        <li>Standard user access</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAssignRole}>
              Assign Role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
