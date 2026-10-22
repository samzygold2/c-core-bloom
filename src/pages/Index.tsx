import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, BookOpenCheck, LibraryBig, ListChecks, ShieldCheck, Timer } from 'lucide-react';
import { useEffect } from 'react';

const features = [
  {
    icon: Timer,
    title: 'A real exam clock',
    body: 'Every test runs against a countdown. When time is up, your answers are submitted for you, just like the CBT centre.',
  },
  {
    icon: LibraryBig,
    title: 'UTME past questions by year',
    body: 'Pick a year, then drill one subject or sit a 2 to 4 subject mock with subject tabs and an on-screen calculator.',
  },
  {
    icon: ListChecks,
    title: 'See where the marks went',
    body: 'Scores per subject on the UTME scale, the right option for every question, and worked explanations where they exist.',
  },
];

const steps = [
  'Create an account and choose your tutor.',
  'Your tutor approves you.',
  'Start the tests they set, or practise past questions.',
];

const Index = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary/10 via-background to-secondary/10">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between gap-2 px-4 py-2.5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpenCheck className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-primary" />
            <span className="truncate text-lg sm:text-xl font-bold">CBT Platform</span>
          </div>
          <div className="flex shrink-0 gap-1 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate('/admin-login')}
              aria-label="Tutor sign in"
              className="h-11 px-3 sm:h-10"
            >
              <ShieldCheck className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Tutor sign in</span>
            </Button>
            <Button variant="outline" onClick={() => navigate('/auth?mode=login')} className="h-11 px-4 sm:h-10">
              Sign in
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-sm">
              JAMB UTME practice
            </p>
            <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Practise for JAMB the way you will sit it
            </h1>
            <p className="mb-8 text-base text-muted-foreground sm:text-lg">
              Timed computer-based tests from your tutor, past UTME questions sorted by year and subject,
              and a clear breakdown of every answer once you submit.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={() => navigate('/auth')} className="h-12 px-6 text-base">
                Create a student account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/auth?mode=login')} className="h-12 px-6 text-base">
                I already have an account
              </Button>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-3 sm:mt-16 sm:gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <Card key={title}>
                <CardContent className="flex gap-4 p-4 sm:p-5 md:flex-col md:gap-3">
                  <div className="h-fit w-fit shrink-0 rounded-lg bg-primary/10 p-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="mb-1 text-base font-semibold">{title}</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <ol className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-6">
            {steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-card text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </main>

      <footer className="border-t bg-card/50 backdrop-blur-sm py-4 sm:py-6">
        <div className="container mx-auto px-4 text-center text-xs sm:text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} CBT Platform · Practice tests and past questions for the JAMB UTME</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
