import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Target, FileDown, HardDriveUpload, Loader2, SearchX } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { downloadTestResultPDF, getPDFBlob } from '@/lib/pdfGenerator';
import { getAccessToken, googleSignIn } from '@/lib/googleAuth';
import { useToast } from '@/hooks/use-toast';

interface UserTest {
  id: string;
  score: number;
  start_time: string | null;
  end_time: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
  tests: {
    title: string;
    total_questions: number;
  } | null;
}

const ResultDetail = () => {
  const { resultId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [result, setResult] = useState<UserTest | null>(null);
  const [profile, setProfile] = useState<{ firstname: string; lastname: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingToDrive, setSavingToDrive] = useState(false);

  const fetchResult = useCallback(async () => {
    if (!user || !resultId) return;
    const { data, error } = await supabase
      .from('user_tests')
      .select(`id, score, start_time, end_time, answers, created_at, tests (title, total_questions)`)
      .eq('id', resultId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!error && data) {
      setResult(data as unknown as UserTest);
      const { data: prof } = await supabase
        .from('profiles')
        .select('firstname, lastname')
        .eq('id', user.id)
        .single();
      if (prof) {
        setProfile(prof as { firstname: string; lastname: string });
      }
    }
    setLoading(false);
  }, [user, resultId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !resultId) {
      navigate('/auth');
      return;
    }
    fetchResult();
  }, [user, resultId, authLoading, navigate, fetchResult]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <SearchX className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">We couldn't find that result</p>
            <p className="mt-1 text-sm text-muted-foreground">It may belong to another account, or the link is wrong.</p>
            <Button onClick={() => navigate('/results')} className="mt-4 h-11 w-full sm:h-10">
              Back to my results
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const testTitle = result.tests?.title ?? 'Untitled test';
  const total = result.tests?.total_questions || 1;
  const percentage = ((result.score / total) * 100).toFixed(1);
  const passed = parseFloat(percentage) >= 60;

  const getStudentName = () => {
    if (profile?.firstname || profile?.lastname) {
      return `${profile.firstname || ''} ${profile.lastname || ''}`.trim();
    }
    return user?.email?.split('@')[0] || 'Student';
  };

  const handleDownloadPDF = () => {
    try {
      downloadTestResultPDF({
        studentName: getStudentName(),
        email: user?.email || '',
        testTitle: testTitle,
        score: result.score,
        totalQuestions: total,
        startTime: result.start_time || result.created_at,
        endTime: result.end_time || result.created_at,
        answers: result.answers || {},
      });
      toast({
        title: 'PDF downloaded',
        description: 'Your result sheet is in your downloads folder.',
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Could not create the PDF',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const handleSaveToDrive = async () => {
    setSavingToDrive(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        const authResult = await googleSignIn();
        if (authResult) {
          token = authResult.accessToken;
        } else {
          throw new Error('Google connection is required to export to Google Drive.');
        }
      }

      const pdfBlob = getPDFBlob({
        studentName: getStudentName(),
        email: user?.email || '',
        testTitle: testTitle,
        score: result.score,
        totalQuestions: total,
        startTime: result.start_time || result.created_at,
        endTime: result.end_time || result.created_at,
        answers: result.answers || {},
      });

      const filename = `${testTitle.replace(/\s+/g, '_')}_Result_${new Date().toISOString().split('T')[0]}.pdf`;

      const metadata = {
        name: filename,
        mimeType: 'application/pdf',
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', pdfBlob);

      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error('Upload to Google Drive failed.');
      }

      toast({
        title: 'Saved to Google Drive',
        description: `"${filename}" is now in your Drive.`,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Could not save to Drive',
        description: errorMsg,
        variant: 'destructive',
      });
    } finally {
      setSavingToDrive(false);
    }
  };

  return (
    <DashboardLayout title="Result" subtitle={testTitle}>
      <div className="max-w-2xl mx-auto">
        <Card className="text-center shadow-md">
          <CardHeader className="p-4 sm:p-6">
            <div className="mx-auto mb-3 sm:mb-4">
              {passed ? (
                <div className="rounded-full bg-primary/10 p-4 sm:p-6 w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center mx-auto">
                  <Award className="h-8 w-8 sm:h-12 sm:w-12 text-primary" />
                </div>
              ) : (
                <div className="rounded-full bg-secondary/10 p-4 sm:p-6 w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center mx-auto">
                  <Target className="h-8 w-8 sm:h-12 sm:w-12 text-secondary-foreground" />
                </div>
              )}
            </div>
            <CardTitle className="text-xl sm:text-3xl mb-2 break-words">{testTitle}</CardTitle>
            <Badge variant={passed ? 'default' : 'secondary'} className="mx-auto w-fit">
              {passed ? 'Passed' : 'Below the 60% pass mark'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
            <div>
              <div className="text-4xl sm:text-6xl font-bold mb-1 sm:mb-2">{percentage}%</div>
              <p className="text-sm sm:text-base text-muted-foreground">{result.score} of {total} questions right</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 text-left">
              <div className="rounded-lg border p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-primary">{result.score}</div>
                <p className="text-xs sm:text-sm text-muted-foreground">Correct</p>
              </div>
              <div className="rounded-lg border p-3 sm:p-4">
                <div className="text-xl sm:text-2xl font-bold text-destructive">
                  {total - result.score}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">Wrong or skipped</p>
              </div>
            </div>

            {/* Document Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button onClick={handleDownloadPDF} variant="secondary" className="w-full gap-2 h-11 sm:h-10">
                <FileDown className="h-4 w-4" />
                Download result PDF
              </Button>
              <Button
                onClick={handleSaveToDrive}
                variant="outline"
                className="w-full gap-2 h-11 sm:h-10 border-primary/25 hover:bg-primary/5 hover:text-primary"
                disabled={savingToDrive}
              >
                {savingToDrive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <HardDriveUpload className="h-4 w-4 text-primary" />
                )}
                {savingToDrive ? 'Saving…' : 'Save PDF to Google Drive'}
              </Button>
            </div>

            <div className="pt-3 sm:pt-4 space-y-2 border-t border-border">
              <Button onClick={() => navigate('/dashboard')} className="h-11 w-full sm:h-10">
                Take another test
              </Button>
              <Button onClick={() => navigate('/results')} variant="outline" className="h-11 w-full sm:h-10">
                All my results
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ResultDetail;
