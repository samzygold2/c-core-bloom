import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, KeyRound, Send, Lock } from 'lucide-react';
import { z } from 'zod';

const userRequestSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50, 'Username too long'),
  role: z.literal('user'),
});

const adminRequestSchema = z.object({
  email: z.string().email('Please enter a valid email address').max(255, 'Email too long'),
  role: z.literal('admin'),
});

const resetSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50, 'Username too long'),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only numbers'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100, 'Password too long'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const ForgotPassword = () => {
  const [activeTab, setActiveTab] = useState<'request' | 'reset'>('request');
  
  // Request OTP state
  const [requestUsername, setRequestUsername] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestRole, setRequestRole] = useState<'user' | 'admin'>('user');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');

  // Reset Password state
  const [resetUsername, setResetUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const navigate = useNavigate();

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccess('');
    setRequestLoading(true);

    try {
      let identifier: string;
      
      if (requestRole === 'admin') {
        const validated = adminRequestSchema.parse({
          email: requestEmail,
          role: requestRole,
        });
        identifier = validated.email;
      } else {
        const validated = userRequestSchema.parse({
          username: requestUsername,
          role: requestRole,
        });
        identifier = validated.username;
      }

      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: {
          action: 'request_otp',
          username: identifier,
          role: requestRole,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setRequestSuccess(data.message || 'Request submitted successfully. Please wait for an admin to generate your OTP.');
      setResetUsername(identifier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        setRequestError(error.errors[0].message);
      } else {
        setRequestError(error instanceof Error ? error.message : 'Failed to submit request');
      }
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);

    try {
      const validated = resetSchema.parse({
        username: resetUsername,
        otp,
        password,
        confirmPassword,
      });

      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: {
          action: 'reset_password',
          username: validated.username,
          otp: validated.otp,
          new_password: validated.password,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResetSuccess(true);
      setTimeout(() => navigate('/auth'), 2000);
    } catch (error) {
      if (error instanceof z.ZodError) {
        setResetError(error.errors[0].message);
      } else {
        setResetError(error instanceof Error ? error.message : 'Failed to reset password');
      }
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl font-bold">Forgot Password</CardTitle>
          </div>
          <CardDescription>
            Request an OTP from your admin or reset your password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'request' | 'reset')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="request" className="flex items-center gap-2">
                <Send className="h-4 w-4" />
                Request OTP
              </TabsTrigger>
              <TabsTrigger value="reset" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Reset Password
              </TabsTrigger>
            </TabsList>

            <TabsContent value="request" className="mt-4">
              <form onSubmit={handleRequestOTP} className="space-y-4">
                {requestError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{requestError}</AlertDescription>
                  </Alert>
                )}

                {requestSuccess && (
                  <Alert className="bg-green-500/10 text-green-700 border-green-500/20">
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>{requestSuccess}</AlertDescription>
                  </Alert>
                )}

                {requestRole === 'user' ? (
                  <div className="space-y-2">
                    <Label htmlFor="request-username">Username</Label>
                    <Input
                      id="request-username"
                      type="text"
                      placeholder="Enter your username"
                      value={requestUsername}
                      onChange={(e) => setRequestUsername(e.target.value)}
                      disabled={requestLoading}
                      maxLength={50}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="request-email">Email</Label>
                    <Input
                      id="request-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      disabled={requestLoading}
                      maxLength={255}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="request-role">Your Role</Label>
                  <Select 
                    value={requestRole} 
                    onValueChange={(v) => setRequestRole(v as 'user' | 'admin')}
                    disabled={requestLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {requestRole === 'user' 
                      ? 'An Admin will generate an OTP for you' 
                      : 'A Super Admin will generate an OTP for you'}
                  </p>
                </div>

                <Button type="submit" className="w-full" disabled={requestLoading}>
                  {requestLoading ? 'Submitting...' : 'Request OTP'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="reset" className="mt-4">
              {resetSuccess ? (
                <Alert className="bg-green-500/10 text-green-700 border-green-500/20">
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Password reset successfully! Redirecting to login...
                  </AlertDescription>
                </Alert>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  {resetError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{resetError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="reset-username">Username</Label>
                    <Input
                      id="reset-username"
                      type="text"
                      placeholder="Enter your username"
                      value={resetUsername}
                      onChange={(e) => setResetUsername(e.target.value)}
                      disabled={resetLoading}
                      maxLength={50}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="otp">OTP</Label>
                    <Input
                      id="otp"
                      type="text"
                      placeholder="Enter 6-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      disabled={resetLoading}
                      maxLength={6}
                      className="text-center text-2xl tracking-widest"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the 6-digit OTP provided by your admin
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={resetLoading}
                      autoComplete="new-password"
                      maxLength={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={resetLoading}
                      autoComplete="new-password"
                      maxLength={100}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={resetLoading}>
                    {resetLoading ? 'Resetting...' : 'Reset Password'}
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="link"
              onClick={() => navigate('/auth')}
              className="text-sm"
            >
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;