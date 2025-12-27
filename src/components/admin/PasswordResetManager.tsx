import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Copy, RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ResetRequest {
  id: string;
  username: string;
  role: string;
  status: string;
  created_at: string;
  processed_at: string | null;
}

interface UserProfile {
  id: string;
  username: string | null;
  firstname: string;
  lastname: string;
  email: string;
}

const PasswordResetManager = () => {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpExpiry, setOtpExpiry] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch pending password reset requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('password_reset_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;
      setRequests(requestsData || []);

      // Fetch all user profiles
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, username, firstname, lastname, email');

      if (usersError) throw usersError;
      setUsers(usersData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const generateOtp = async (user: UserProfile) => {
    setSelectedUser(user);
    setGeneratedOtp(null);
    setOtpExpiry(null);
    setGenerating(true);
    setDialogOpen(true);

    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: {
          action: 'generate_otp',
          user_id: user.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGeneratedOtp(data.otp);
      setOtpExpiry(data.expires_at);

      // Mark any pending requests for this username as processed
      await supabase
        .from('password_reset_requests')
        .update({ 
          status: 'processed', 
          processed_at: new Date().toISOString() 
        })
        .eq('username', user.username || user.email.replace('@cbt.local', ''))
        .eq('status', 'pending');

      fetchData(); // Refresh the list

      toast({
        title: 'OTP Generated',
        description: 'Share this OTP with the user. It expires in 15 minutes.',
      });
    } catch (error) {
      console.error('Error generating OTP:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate OTP',
        variant: 'destructive',
      });
      setDialogOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  const copyOtp = () => {
    if (generatedOtp) {
      navigator.clipboard.writeText(generatedOtp);
      toast({
        title: 'Copied',
        description: 'OTP copied to clipboard',
      });
    }
  };

  const getUserForRequest = (request: ResetRequest): UserProfile | undefined => {
    return users.find(u => 
      u.username === request.username || 
      u.email === `${request.username}@cbt.local`
    );
  };

  return (
    <div className="space-y-6">
      {/* Pending Requests Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Password Reset Requests
              </CardTitle>
              <CardDescription>
                Users waiting for OTP generation
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No pending requests</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((request) => {
                  const user = getUserForRequest(request);
                  return (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.username}</TableCell>
                      <TableCell>
                        <Badge variant={request.role === 'admin' ? 'default' : 'secondary'}>
                          {request.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        {user ? (
                          <Button size="sm" onClick={() => generateOtp(user)}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Generate OTP
                          </Button>
                        ) : (
                          <span className="text-destructive text-sm">User not found</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* All Users Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Generate OTP for Any User
          </CardTitle>
          <CardDescription>
            Manually generate an OTP for password reset
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.slice(0, 10).map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstname} {user.lastname}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.username || user.email.replace('@cbt.local', '')}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => generateOtp(user)}>
                      <KeyRound className="h-4 w-4 mr-2" />
                      Generate OTP
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length > 10 && (
            <p className="text-muted-foreground text-sm text-center mt-4">
              Showing first 10 users. Use the pending requests above for specific users.
            </p>
          )}
        </CardContent>
      </Card>

      {/* OTP Display Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Generated OTP
            </DialogTitle>
            <DialogDescription>
              Share this OTP with {selectedUser?.firstname} {selectedUser?.lastname}
            </DialogDescription>
          </DialogHeader>

          {generating ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : generatedOtp ? (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This OTP will expire in 15 minutes. Share it securely with the user.
                </AlertDescription>
              </Alert>

              <div className="bg-muted rounded-lg p-6 text-center">
                <p className="text-4xl font-mono font-bold tracking-[0.5em] text-primary">
                  {generatedOtp}
                </p>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                User: <strong>{selectedUser?.username || selectedUser?.email.replace('@cbt.local', '')}</strong>
              </p>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Failed to generate OTP</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            {generatedOtp && (
              <Button onClick={copyOtp} variant="outline">
                <Copy className="h-4 w-4 mr-2" />
                Copy OTP
              </Button>
            )}
            <Button onClick={() => setDialogOpen(false)}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PasswordResetManager;