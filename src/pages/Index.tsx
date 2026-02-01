import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, Clock, Trophy, Shield } from 'lucide-react';
import { useEffect } from 'react';

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
        <div className="container mx-auto flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            <h1 className="text-lg sm:text-2xl font-bold">CBT Platform</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/admin-login')}>
              <Shield className="mr-1 sm:mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
            <Button size="sm" onClick={() => navigate('/auth')}>
              <span className="hidden sm:inline">Get Started</span>
              <span className="sm:hidden">Start</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
        <div className="container mx-auto max-w-6xl text-center">
          <h2 className="mb-3 sm:mb-4 text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            Computer-Based Testing Made Simple
          </h2>
          <p className="mb-8 sm:mb-12 text-base sm:text-lg lg:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
            Take tests online with a modern, user-friendly interface. Track your progress and improve your skills.
          </p>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-8 sm:mb-12 px-2">
            <Card className="text-left sm:text-center">
              <CardContent className="pt-4 sm:pt-6 flex sm:flex-col items-center sm:items-center gap-4 sm:gap-0">
                <Clock className="h-10 w-10 sm:h-12 sm:w-12 text-primary sm:mx-auto sm:mb-4 flex-shrink-0" />
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2">Timed Tests</h3>
                  <p className="text-sm text-muted-foreground">
                    30 or 60-minute tests with automatic submission and countdown timer
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="text-left sm:text-center">
              <CardContent className="pt-4 sm:pt-6 flex sm:flex-col items-center sm:items-center gap-4 sm:gap-0">
                <Trophy className="h-10 w-10 sm:h-12 sm:w-12 text-primary sm:mx-auto sm:mb-4 flex-shrink-0" />
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2">Instant Results</h3>
                  <p className="text-sm text-muted-foreground">
                    Get your scores immediately after test submission with detailed analytics
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="text-left sm:text-center sm:col-span-2 lg:col-span-1">
              <CardContent className="pt-4 sm:pt-6 flex sm:flex-col items-center sm:items-center gap-4 sm:gap-0">
                <Shield className="h-10 w-10 sm:h-12 sm:w-12 text-primary sm:mx-auto sm:mb-4 flex-shrink-0" />
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2">Secure & Fair</h3>
                  <p className="text-sm text-muted-foreground">
                    Randomized questions and secure authentication ensure test integrity
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Button size="lg" onClick={() => navigate('/auth')} className="text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6">
            Start Taking Tests Now
          </Button>
        </div>
      </main>

      <footer className="border-t bg-card/50 backdrop-blur-sm py-4 sm:py-6">
        <div className="container mx-auto text-center text-xs sm:text-sm text-muted-foreground px-4">
          <p>© {new Date().getFullYear()} CBT Platform. Built with modern technology for the best testing experience.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
