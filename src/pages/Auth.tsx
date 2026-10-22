import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { BackButton } from '@/components/BackButton';
import { z } from 'zod';

const signUpSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(20, 'Username must be less than 20 characters').regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  firstname: z.string().min(2, 'First name must be at least 2 characters'),
  lastname: z.string().min(2, 'Last name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const signInSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

// Convert username to email format for Supabase auth
const usernameToEmail = (username: string) => `${username.toLowerCase()}@cbt.local`;

interface AdminProfile {
  id: string;
  firstname: string;
  lastname: string;
}

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') === 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user, isAdmin, adminLoading, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  

  useEffect(() => {
    // Redirect based on role once auth and admin check are done
    if (authLoading || adminLoading) return;
    if (user) {
      navigate(isAdmin ? '/admin' : '/dashboard');
    }
  }, [user, isAdmin, authLoading, adminLoading, navigate]);

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    // Use secure view that only exposes non-sensitive admin info
    const { data: adminProfiles } = await supabase
      .from('admin_profiles_public')
      .select('id, firstname, lastname');

    if (adminProfiles) {
      // Filter out admins with empty names (not properly configured)
      const validAdmins = adminProfiles.filter(
        (admin) => admin.firstname?.trim() && admin.lastname?.trim()
      );
      setAdmins(validAdmins);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const validated = signInSchema.parse({ username, password });
        const email = usernameToEmail(validated.username);
        const { error } = await signIn(email, validated.password);
        
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Could not sign you in',
              description: 'That username and password do not match. Check for typos and try again.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Error',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Signed in',
            description: 'Taking you to your tests.',
          });
          // Navigation handled by useEffect based on role
        }
      } else {
        // Validate admin selection is required
        if (!selectedAdminId) {
          toast({
            title: 'Choose your tutor',
            description: 'Pick the tutor who will approve your account before you sign up.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        const validated = signUpSchema.parse({ username, password, confirmPassword, firstname, lastname });
        const email = usernameToEmail(validated.username);
        const { error, data } = await signUp(email, validated.password, validated.firstname, validated.lastname);
        
        if (error) {
          if (error.message.includes('User already registered')) {
            toast({
              title: 'Username taken',
              description: 'Someone already uses that username. Try adding a number or your surname.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Error',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          // Update the profile with selected admin and username
          if (data?.user) {
            await supabase
              .from('profiles')
              .update({
                username: validated.username,
                assigned_admin_id: selectedAdminId,
                is_pending: true,
                is_waiting: false,
              })
              .eq('id', data.user.id);
          }
          
          toast({
            title: 'Account created',
            description: 'Your tutor needs to approve you. Sign in any time to check.',
          });
          setIsLogin(true);
        }
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Check the form',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Show loading spinner while auth is loading
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-3 sm:p-4">
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
        <BackButton to="/" label="Home" />
      </div>
      <Card className="w-full max-w-md mt-14 sm:mt-0">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl">
            {isLogin ? 'Welcome back' : 'Create your student account'}
          </CardTitle>
          <CardDescription className="text-sm">
            {isLogin
              ? 'Sign in with the username you registered with.'
              : 'Your tutor approves new accounts before tests unlock.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <Tabs value={isLogin ? 'login' : 'signup'} onValueChange={(v) => setIsLogin(v === 'login')}>
            <TabsList className="grid h-11 w-full grid-cols-2 sm:h-10">
              <TabsTrigger value="login" className="h-full text-sm">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="h-full text-sm">New account</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="login-username" className="text-sm">Username</Label>
                  <Input
                    id="login-username"
                    type="text"
                    placeholder="e.g. amaka_o"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="h-11 sm:h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="login-password" className="text-sm">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 sm:h-10"
                  />
                </div>
                <Button type="submit" className="h-11 w-full sm:h-10" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => navigate('/forgot-password')}
                    className="h-11 text-sm sm:h-10"
                  >
                    Forgot your password?
                  </Button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signup-firstname" className="text-sm">First name <span className="text-destructive">*</span></Label>
                    <Input
                      id="signup-firstname"
                      type="text"
                      placeholder="Amaka"
                      autoComplete="given-name"
                      value={firstname}
                      onChange={(e) => setFirstname(e.target.value)}
                      required
                      className="h-11 sm:h-10"
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="signup-lastname" className="text-sm">Last name <span className="text-destructive">*</span></Label>
                    <Input
                      id="signup-lastname"
                      type="text"
                      placeholder="Okonkwo"
                      autoComplete="family-name"
                      value={lastname}
                      onChange={(e) => setLastname(e.target.value)}
                      required
                      className="h-11 sm:h-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-username" className="text-sm">Username <span className="text-destructive">*</span></Label>
                  <Input
                    id="signup-username"
                    type="text"
                    placeholder="Letters, numbers or _"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="h-11 sm:h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-password" className="text-sm">Password <span className="text-destructive">*</span></Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-11 sm:h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-confirm-password" className="text-sm">Confirm password <span className="text-destructive">*</span></Label>
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    placeholder="Type it again"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="h-11 sm:h-10"
                  />
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="signup-admin" className="text-sm">
                    Your tutor <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedAdminId} onValueChange={setSelectedAdminId} required>
                    <SelectTrigger className="h-11 sm:h-10">
                      <SelectValue placeholder="Choose your tutor" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {admins.length > 0 ? (
                        admins.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.firstname} {admin.lastname}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No tutors are set up yet
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    The tutor or school admin who sets your tests. They approve your account.
                  </p>
                </div>
                <Button type="submit" className="h-11 w-full sm:h-10" disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;