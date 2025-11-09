import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Upload } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const text = await file.text();
      let questions: any[] = [];

      if (file.name.endsWith('.json')) {
        questions = JSON.parse(text);
      } else if (file.name.endsWith('.csv')) {
        questions = parseCSV(text);
      } else {
        toast({
          title: 'Error',
          description: 'Please upload a CSV or JSON file',
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      // Validate and insert questions
      const validQuestions = questions.filter(q => 
        q.test_id && 
        q.question_text?.trim() && 
        Array.isArray(q.options) && 
        q.options.length >= 2 &&
        typeof q.correct_answer === 'number' &&
        q.correct_answer >= 0 &&
        q.correct_answer < q.options.length
      );

      if (validQuestions.length === 0) {
        toast({
          title: 'Error',
          description: 'No valid questions found in file',
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      const { error } = await supabase
        .from('questions')
        .insert(validQuestions.map(q => ({
          test_id: q.test_id,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty || 'medium',
        })));

      if (error) {
        toast({
          title: 'Error',
          description: 'Failed to import questions',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `Imported ${validQuestions.length} questions successfully`,
        });
        
        await supabase.from('audit_log').insert({
          admin_id: (await supabase.auth.getUser()).data.user?.id,
          action: `Bulk imported ${validQuestions.length} questions`,
        });

        fetchQuestions();
        setShowImportDialog(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to parse file',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const questions: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const question: any = {};

      headers.forEach((header, index) => {
        if (header === 'options') {
          question[header] = values[index].split('|').map(o => o.trim());
        } else if (header === 'correct_answer') {
          question[header] = parseInt(values[index]);
        } else {
          question[header] = values[index];
        }
      });

      questions.push(question);
    }

    return questions;
  };

  const downloadTemplate = (format: 'json' | 'csv') => {
    const sampleQuestions = [
      {
        test_id: 'YOUR_TEST_ID_HERE',
        question_text: 'What is 2 + 2?',
        options: ['3', '4', '5', '6'],
        correct_answer: 1,
        difficulty: 'easy'
      },
      {
        test_id: 'YOUR_TEST_ID_HERE',
        question_text: 'Which planet is closest to the sun?',
        options: ['Venus', 'Mercury', 'Earth', 'Mars'],
        correct_answer: 1,
        difficulty: 'medium'
      }
    ];

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(sampleQuestions, null, 2);
      filename = 'questions_template.json';
      mimeType = 'application/json';
    } else {
      const headers = 'test_id,question_text,options,correct_answer,difficulty';
      const rows = sampleQuestions.map(q => 
        `${q.test_id},"${q.question_text}","${q.options.join('|')}",${q.correct_answer},${q.difficulty}`
      );
      content = [headers, ...rows].join('\n');
      filename = 'questions_template.csv';
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Manage Questions</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-2 h-4 w-4" />
            New Question
          </Button>
        </div>
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

      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Import Questions</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <div>
                <p className="mb-4">Upload a CSV or JSON file with questions. Make sure your file includes:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><strong>test_id</strong>: The ID of the test</li>
                  <li><strong>question_text</strong>: The question</li>
                  <li><strong>options</strong>: Array of options (JSON) or pipe-separated (CSV: "Option1|Option2|Option3")</li>
                  <li><strong>correct_answer</strong>: Index of correct option (0-based)</li>
                  <li><strong>difficulty</strong>: easy, medium, or hard (optional, defaults to medium)</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate('json')}
                >
                  Download JSON Template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate('csv')}
                >
                  Download CSV Template
                </Button>
              </div>

              <div className="border-2 border-dashed rounded-lg p-6">
                <Input
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileImport}
                  disabled={importing}
                  className="cursor-pointer"
                />
                {importing && (
                  <p className="mt-2 text-sm text-muted-foreground">Importing questions...</p>
                )}
              </div>

              <div className="bg-muted p-3 rounded text-xs">
                <strong>Available Test IDs:</strong>
                <div className="mt-2 space-y-1">
                  {tests.map(test => (
                    <div key={test.id} className="font-mono">
                      {test.title}: <span className="text-primary">{test.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};