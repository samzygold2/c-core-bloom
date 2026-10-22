import { useEffect, useState, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { googleSignIn, googleSignOut, getAccessToken, initGoogleAuth } from '@/lib/googleAuth';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Folder,
  File as FileIcon,
  Upload,
  Trash2,
  ExternalLink,
  RefreshCw,
  LogOut,
  Cloud,
  HardDrive,
  CheckCircle2,
  FileSpreadsheet,
  FileJson,
  FileText,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { User as FirebaseUser } from 'firebase/auth';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
}

export default function GoogleDrivePage() {
  const { user: supabaseUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [backingUp, setBackingUp] = useState(false);

  const fetchDriveFiles = useCallback(async (token: string) => {
    if (!token) return;
    setLoadingFiles(true);
    try {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,size,createdTime,webViewLink)&orderBy=createdTime%20desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          googleSignOut();
          setAccessToken(null);
          setGoogleUser(null);
          throw new Error('Session expired. Please reconnect your Google Drive.');
        }
        throw new Error('Failed to fetch files from Google Drive.');
      }

      const data = await response.json();
      setFiles((data.files || []) as DriveFile[]);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Could not load your Drive files',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setLoadingFiles(false);
    }
  }, [toast]);

  // Authenticate & listen to Google Auth changes
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
        setLoading(false);
        fetchDriveFiles(token);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
        setLoading(false);
      }
    );

    getAccessToken().then((token) => {
      if (token) {
        setAccessToken(token);
        fetchDriveFiles(token);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [fetchDriveFiles]);

  const handleGoogleConnect = async () => {
    try {
      setLoading(true);
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setAccessToken(result.accessToken);
        toast({
          title: 'Google Drive connected',
          description: `Signed in as ${result.user.email}`,
        });
        fetchDriveFiles(result.accessToken);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Google sign-in did not finish',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    const confirmed = window.confirm('Are you sure you want to disconnect Google Drive?');
    if (!confirmed) return;

    try {
      await googleSignOut();
      setGoogleUser(null);
      setAccessToken(null);
      setFiles([]);
      toast({
        title: 'Google Drive disconnected',
        description: 'Files already saved stay in your Drive.',
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Could not disconnect',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;

    setUploading(true);
    setUploadProgress(20);
    try {
      const metadata = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);

      setUploadProgress(50);
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error('Upload to Google Drive failed.');
      }

      setUploadProgress(100);
      toast({
        title: 'Uploaded',
        description: `"${file.name}" is now in your Drive.`,
      });
      fetchDriveFiles(accessToken);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Upload did not finish',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (fileId: string, filename: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${filename}" from Google Drive? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete file.');
      }

      toast({
        title: 'File deleted',
        description: `"${filename}" was removed from your Drive.`,
      });

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Could not delete the file',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const handleBackupCbtData = async () => {
    if (!accessToken || !supabaseUser) return;
    setBackingUp(true);

    try {
      const { data: results, error } = await supabase
        .from('user_tests')
        .select(`id, score, created_at, tests (title, total_questions, duration_minutes)`)
        .eq('user_id', supabaseUser.id);

      if (error) throw error;

      const profileResponse = await supabase
        .from('profiles')
        .select('firstname, lastname')
        .eq('id', supabaseUser.id)
        .single();

      const profileName = profileResponse.data
        ? `${profileResponse.data.firstname} ${profileResponse.data.lastname}`
        : 'Student';

      const backupData = {
        studentName: profileName,
        email: supabaseUser.email,
        backupTime: new Date().toISOString(),
        results: results || [],
      };

      const filename = `CBT_Scores_Backup_${new Date().toISOString().split('T')[0]}.json`;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });

      const metadata = {
        name: filename,
        mimeType: 'application/json',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error('Google Drive upload rejected.');
      }

      toast({
        title: 'Scores backed up',
        description: `Saved to your Drive as "${filename}"`,
      });

      fetchDriveFiles(accessToken);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Backup did not finish',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setBackingUp(false);
    }
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getMimeTypeIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') return <Folder className="h-5 w-5 text-amber-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-rose-500" />;
    if (mimeType.includes('json')) return <FileJson className="h-5 w-5 text-emerald-500" />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel')) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    return <FileIcon className="h-5 w-5 text-blue-500" />;
  };

  const formatBytes = (bytes?: string) => {
    if (!bytes) return 'N/A';
    const num = parseInt(bytes, 10);
    if (isNaN(num)) return 'N/A';
    if (num < 1024) return `${num} B`;
    if (num < 1048576) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / 1048576).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <DashboardLayout title="Google Drive" subtitle="Keep result PDFs and score backups in your own Drive">
        <div className="flex h-64 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Checking your Google connection…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Google Drive" subtitle="Keep result PDFs and score backups in your own Drive">
      <div className="space-y-6 max-w-6xl mx-auto">
        <Card className="border-primary/20 overflow-hidden shadow-md">
          <CardHeader className="p-4 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg sm:text-xl">Your Google account</CardTitle>
            </div>
            <CardDescription>
              Connect once, then save result PDFs and score backups straight to your Drive.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {googleUser && accessToken ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-primary/5">
                <div className="flex items-center gap-3 min-w-0">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || 'Google User'}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-full border border-primary/20 shadow-sm"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {(googleUser.displayName?.[0] || 'G').toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {googleUser.displayName || 'Google Account'}
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-500/10" />
                    </p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{googleUser.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 gap-1.5 border-primary/30"
                    onClick={handleBackupCbtData}
                    disabled={backingUp}
                  >
                    {backingUp ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileJson className="h-3.5 w-3.5 text-primary" />
                    )}
                    {backingUp ? 'Backing up…' : 'Back up my scores'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleGoogleDisconnect}
                    className="h-10 gap-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-5 sm:p-8 text-center border-2 border-dashed rounded-xl bg-muted/20 space-y-4">
                <div className="p-3 bg-primary/10 rounded-full text-primary">
                  <Cloud className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="font-semibold">Not connected yet</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    Sign in with Google to save result PDFs, back up your score history and upload your own study files.
                  </p>
                </div>
                <button
                  onClick={handleGoogleConnect}
                  className="gsi-material-button min-h-11 font-sans border bg-card shadow-sm rounded-lg py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="gsi-material-button-state"></div>
                  <div className="gsi-material-button-content-wrapper flex items-center justify-center gap-3 px-4">
                    <div className="gsi-material-button-icon shrink-0">
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: 20, height: 20 }}>
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        <path fill="none" d="M0 0h48v48H0z"></path>
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents text-sm font-medium text-foreground">Sign in with Google</span>
                  </div>
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {googleUser && accessToken && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  Upload a file
                </CardTitle>
                <CardDescription>
                  Send a file from this device to your Drive.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all text-center"
                >
                  <div className="p-3 bg-muted group-hover:bg-primary/10 rounded-full text-muted-foreground group-hover:text-primary transition-colors mb-3">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium">Choose a file</p>
                  <p className="text-xs text-muted-foreground mt-1">PDFs, images, spreadsheets or JSON backups</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {uploading && (
                  <div className="space-y-1 bg-muted/40 p-3 rounded-lg border border-border">
                    <div className="flex justify-between text-xs font-mono">
                      <span>Uploading file...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-1.5" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3 border-b">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">Files in your Drive</CardTitle>
                    <CardDescription>
                      Open or delete files this app can see in your Drive.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Search by file name"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10 min-w-0 flex-1 sm:w-56 sm:flex-none"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Refresh file list"
                      className="h-10 w-10 shrink-0"
                      onClick={() => fetchDriveFiles(accessToken)}
                      disabled={loadingFiles}
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingFiles ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Loading your files…</p>
                    </div>
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-muted-foreground">
                    <Cloud className="h-10 w-10 text-muted-foreground/40 mb-2" />
                    <p className="text-sm">{searchQuery ? 'No file names match that search' : 'No files yet'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Save a result PDF or upload a file and it will show here.</p>
                  </div>
                ) : (
                  <div className="divide-y max-h-[500px] overflow-y-auto">
                    {filteredFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 p-3 sm:p-4 hover:bg-muted/30 transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="p-2 rounded-lg bg-background border shadow-sm shrink-0">
                            {getMimeTypeIcon(file.mimeType)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span>{formatBytes(file.size)}</span>
                              <span>•</span>
                              <span>{file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'N/A'}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                          {file.webViewLink && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              className="h-10 w-10 lg:h-8 lg:w-8 text-muted-foreground hover:text-foreground"
                            >
                              <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" title="Open in Google Drive" aria-label={`Open ${file.name} in Google Drive`}>
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteFile(file.id, file.name)}
                            className="h-10 w-10 lg:h-8 lg:w-8 text-muted-foreground hover:text-destructive"
                            title="Delete file"
                            aria-label={`Delete ${file.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
