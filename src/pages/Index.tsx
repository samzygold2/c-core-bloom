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
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">CBT Platform</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/admin-login')}>
              <Shield className="mr-2 h-4 w-4" />
              Admin
            </Button>
            <Button onClick={() => navigate('/auth')}>Get Started</Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="container mx-auto max-w-6xl text-center">
          <h2 className="mb-4 text-5xl font-bold">
            Computer-Based Testing Made Simple
          </h2>
          <p className="mb-12 text-xl text-muted-foreground">
            Take tests online with a modern, user-friendly interface. Track your progress and improve your skills.
          </p>

          <div className="grid gap-6 md:grid-cols-3 mb-12">
            <Card>
              <CardContent className="pt-6">
                <Clock className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Timed Tests</h3>
                <p className="text-muted-foreground">
                  30 or 60-minute tests with automatic submission and countdown timer
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Instant Results</h3>
                <p className="text-muted-foreground">
                  Get your scores immediately after test submission with detailed analytics
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <Shield className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Secure & Fair</h3>
                <p className="text-muted-foreground">
                  Randomized questions and secure authentication ensure test integrity
                </p>
              </CardContent>
            </Card>
          </div>

          <Button size="lg" onClick={() => navigate('/auth')} className="text-lg px-8 py-6">
            Start Taking Tests Now
          </Button>
        </div>
      </main>

      <footer className="border-t bg-card/50 backdrop-blur-sm py-6">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>© 2024 CBT Platform. Built with modern technology for the best testing experience.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
