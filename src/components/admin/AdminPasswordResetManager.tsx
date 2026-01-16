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

interface AdminProfile {
  id: string;
  username: string | null;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
}

const AdminPasswordResetManager = () => {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminProfile | null>(null);
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
      // Fetch pending password reset requests for admins only
      const { data: requestsData, error: requestsError } = await supabase
        .from('password_reset_requests')
        .select('*')
        .eq('status', 'pending')
        .eq('role', 'admin')
        .order('created_at', { ascending: false });

      if (requestsError) throw requestsError;
      setRequests(requestsData || []);

      // Fetch admin user IDs
      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin', 'super_admin']);

      if (rolesError) throw rolesError;

      const adminUserIds = (adminRoles || []).map(r => r.user_id);
      
      if (adminUserIds.length > 0) {
        // Fetch admin profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, firstname, lastname, email')
          .in('id', adminUserIds);

        if (profilesError) throw profilesError;

        // Merge role info
        const adminsWithRoles = (profilesData || []).map(profile => {
          const roleEntry = adminRoles?.find(r => r.user_id === profile.id);
          return {
            ...profile,
            role: roleEntry?.role || 'admin'
          };
        });

        setAdmins(adminsWithRoles);
      } else {
        setAdmins([]);
      }
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

  const generateOtp = async (admin: AdminProfile) => {
    setSelectedAdmin(admin);
    setGeneratedOtp(null);
    setOtpExpiry(null);
    setGenerating(true);
    setDialogOpen(true);

    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: {
          action: 'generate_otp',
          user_id: admin.id,
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
        .eq('username', admin.username || admin.email.replace('@cbt.local', ''))
        .eq('status', 'pending');

      fetchData(); // Refresh the list

      toast({
        title: 'OTP Generated',
        description: 'Share this OTP with the admin. It expires in 15 minutes.',
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

  const getAdminForRequest = (request: ResetRequest): AdminProfile | undefined => {
    return admins.find(a => 
      a.username === request.username || 
      a.email === `${request.username}@cbt.local`
    );
  };

  return (
    <div className="space-y-6">
      {/* Pending Requests Section */}
      <Card className="bg-white border-blue-100 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <Clock className="h-5 w-5 text-blue-500" />
                Pending Admin Password Reset Requests
              </CardTitle>
              <CardDescription className="text-slate-500">
                Admins waiting for OTP generation
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="border-blue-300 text-blue-600 hover:bg-blue-50">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No pending admin requests</p>
          ) : (
            <div className="rounded-lg border border-blue-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50 hover:bg-blue-50">
                    <TableHead className="text-slate-600">Username</TableHead>
                    <TableHead className="text-slate-600">Requested</TableHead>
                    <TableHead className="text-slate-600">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const admin = getAdminForRequest(request);
                    return (
                      <TableRow key={request.id} className="border-blue-50 hover:bg-blue-50/50">
                        <TableCell className="font-medium text-slate-800">{request.username}</TableCell>
                        <TableCell className="text-slate-500">
                          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          {admin ? (
                            <Button size="sm" onClick={() => generateOtp(admin)} className="bg-blue-600 hover:bg-blue-700">
                              <KeyRound className="h-4 w-4 mr-2" />
                              Generate OTP
                            </Button>
                          ) : (
                            <span className="text-red-500 text-sm">Admin not found</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Admins Section */}
      <Card className="bg-white border-blue-100 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <KeyRound className="h-5 w-5 text-blue-500" />
            Generate OTP for Any Admin
          </CardTitle>
          <CardDescription className="text-slate-500">
            Manually generate an OTP for admin password reset
          </CardDescription>
        </CardHeader>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No admins found</p>
          ) : (
            <div className="rounded-lg border border-blue-100 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50 hover:bg-blue-50">
                    <TableHead className="text-slate-600">Name</TableHead>
                    <TableHead className="text-slate-600">Username</TableHead>
                    <TableHead className="text-slate-600">Role</TableHead>
                    <TableHead className="text-slate-600">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map((admin) => (
                    <TableRow key={admin.id} className="border-blue-50 hover:bg-blue-50/50">
                      <TableCell className="font-medium text-slate-800">
                        {admin.firstname} {admin.lastname}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {admin.username || admin.email.replace('@cbt.local', '')}
                      </TableCell>
                      <TableCell>
                        <Badge className={admin.role === 'super_admin' ? 'bg-blue-700 text-white' : 'bg-blue-500 text-white'}>
                          {admin.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => generateOtp(admin)} className="border-blue-300 text-blue-600 hover:bg-blue-50">
                          <KeyRound className="h-4 w-4 mr-2" />
                          Generate OTP
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
              Share this OTP with {selectedAdmin?.firstname} {selectedAdmin?.lastname}
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
                  This OTP will expire in 15 minutes. Share it securely with the admin.
                </AlertDescription>
              </Alert>

              <div className="bg-muted rounded-lg p-6 text-center">
                <p className="text-4xl font-mono font-bold tracking-[0.5em] text-primary">
                  {generatedOtp}
                </p>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Admin: <strong>{selectedAdmin?.username || selectedAdmin?.email.replace('@cbt.local', '')}</strong>
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

export default AdminPasswordResetManager;
