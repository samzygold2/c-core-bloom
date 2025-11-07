import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

interface Test {
  id: string;
  title: string;
}

interface Question {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: number;
  difficulty: string;
  tests: { title: string };
}

export const QuestionManager = () => {
  const [tests, setTests] = useState<Test[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedTest, setSelectedTest] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  const { toast } = useToast();

  useEffect(() => {
    fetchTests();
    fetchQuestions();
  }, []);

  const fetchTests = async () => {
    const { data } = await supabase
      .from('tests')
      .select('id, title')
      .order('created_at', { ascending: false });
    
    if (data) setTests(data);
  };

  const fetchQuestions = async () => {
    const { data } = await supabase
      .from('questions')
      .select('*, tests(title)')
      .order('created_at', { ascending: false });
    
    if (data) setQuestions(data as any);
  };

  const handleCreate = async () => {
    if (!selectedTest || !questionText.trim() || options.some(o => !o.trim())) {
      toast({
        title: 'Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('questions')
      .insert({
        test_id: selectedTest,
        question_text: questionText,
        options: options,
        correct_answer: correctAnswer,
        difficulty: difficulty,
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to create question',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Question created successfully',
      });
      
      await supabase.from('audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: `Added question to test`,
      });
      
      resetForm();
      fetchQuestions();
    }
  };

  const resetForm = () => {
    setQuestionText('');
    setOptions(['', '', '', '']);
    setCorrectAnswer(0);
    setDifficulty('medium');
    setShowForm(false);
  };

  const handleDelete = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) {
      return;
    }

    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', questionId);

    if (!error) {
      toast({
        title: 'Success',
        description: 'Question deleted successfully',
      });
      fetchQuestions();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Manage Questions</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          New Question
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Select Test</Label>
              <Select value={selectedTest} onValueChange={setSelectedTest}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a test" />
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

            <div>
              <Label>Question Text</Label>
              <Textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Enter your question"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Options</Label>
              {options.map((option, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    value={option}
                    onChange={(e) => {
                      const newOptions = [...options];
                      newOptions[index] = e.target.value;
                      setOptions(newOptions);
                    }}
                    placeholder={`Option ${index + 1}`}
                  />
                  <Button
                    type="button"
                    variant={correctAnswer === index ? 'default' : 'outline'}
                    onClick={() => setCorrectAnswer(index)}
                  >
                    {correctAnswer === index ? '✓ Correct' : 'Set Correct'}
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate}>Create Question</Button>
              <Button variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {questions.map((question) => (
          <Card key={question.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground mb-1">
                    {question.tests.title}
                  </div>
                  <CardTitle className="text-lg">{question.question_text}</CardTitle>
                  <div className="mt-2 space-y-1">
                    {question.options.map((option, index) => (
                      <div
                        key={index}
                        className={`text-sm p-2 rounded ${
                          index === question.correct_answer
                            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                            : 'bg-muted'
                        }`}
                      >
                        {index + 1}. {option}
                      </div>
                    ))}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDelete(question.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
};