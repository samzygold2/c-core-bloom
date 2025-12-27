import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2 } from 'lucide-react';

interface Test {
  id: string;
  title: string;
}

interface GeneratedQuestion {
  question_text: string;
  options: string[];
  correct_answer: number;
}

interface AIQuestionGeneratorProps {
  tests: Test[];
  onQuestionsGenerated: () => void;
}

export const AIQuestionGenerator = ({ tests, onQuestionsGenerated }: AIQuestionGeneratorProps) => {
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [count, setCount] = useState(5);
  const [selectedTest, setSelectedTest] = useState('');
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!topic.trim() || !selectedTest) {
      toast({
        title: 'Error',
        description: 'Please enter a topic and select a test',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);

    // Ensure count is within valid range
    const validCount = Math.min(count, 100);

    try {
      const { data, error } = await supabase.functions.invoke('generate-questions', {
        body: { topic, difficulty, count: validCount }
      });

      if (error) {
        throw error;
      }

      if (!data?.questions || data.questions.length === 0) {
        throw new Error('No questions generated');
      }

      // Insert all generated questions as pending review
      const questionsToInsert = data.questions.map((q: GeneratedQuestion) => ({
        test_id: selectedTest,
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        difficulty: difficulty,
        is_reviewed: false,
      }));

      const { error: insertError } = await supabase
        .from('questions')
        .insert(questionsToInsert);

      if (insertError) {
        throw insertError;
      }

      // Log audit entry
      await supabase.from('audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: `Generated ${data.questions.length} AI questions for topic: ${topic}`,
      });

      toast({
        title: 'Success',
        description: `Generated ${data.questions.length} questions (pending review)`,
      });

      // Reset form
      setTopic('');
      setCount(5);
      onQuestionsGenerated();

    } catch (error: any) {
      console.error('Error generating questions:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate questions',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Question Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              placeholder="e.g., JavaScript Arrays, World History, etc."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={generating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-test">Test</Label>
            <Select value={selectedTest} onValueChange={setSelectedTest} disabled={generating}>
              <SelectTrigger id="ai-test">
                <SelectValue placeholder="Select a test" />
              </SelectTrigger>
              <SelectContent>
                {tests.map((test) => (
                  <SelectItem key={test.id} value={test.id}>
                    {test.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-difficulty">Difficulty</Label>
            <Select value={difficulty} onValueChange={setDifficulty} disabled={generating}>
              <SelectTrigger id="ai-difficulty">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="count">Number of Questions</Label>
            <Select 
              value={count.toString()} 
              onValueChange={(v) => setCount(parseInt(v))}
              disabled={generating}
            >
              <SelectTrigger id="count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 questions</SelectItem>
                <SelectItem value="10">10 questions</SelectItem>
                <SelectItem value="15">15 questions</SelectItem>
                <SelectItem value="20">20 questions</SelectItem>
                <SelectItem value="30">30 questions</SelectItem>
                <SelectItem value="40">40 questions</SelectItem>
                <SelectItem value="50">50 questions</SelectItem>
                <SelectItem value="60">60 questions</SelectItem>
                <SelectItem value="80">80 questions</SelectItem>
                <SelectItem value="100">100 questions</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={generating}
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Questions...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Questions
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
