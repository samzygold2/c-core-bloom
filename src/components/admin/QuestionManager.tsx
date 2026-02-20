import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Upload, Search, Filter, Edit, Save, X, CheckSquare, Square, CheckCircle, Clock } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AIQuestionGenerator } from './AIQuestionGenerator';

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
  is_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTest, setFilterTest] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterReviewStatus, setFilterReviewStatus] = useState('all');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState(0);
  const [editDifficulty, setEditDifficulty] = useState('medium');
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTests();
    fetchQuestions();
  }, []);

  const fetchTests = async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    const { data } = await supabase
      .from('tests')
      .select('id, title')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });
    
    if (data) setTests(data);
  };

  const fetchQuestions = async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    const { data } = await supabase
      .from('questions')
      .select('*, tests(title)')
      .eq('created_by', userId)
      .order('is_reviewed', { ascending: true })
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

    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    const { error } = await supabase
      .from('questions')
      .insert({
        test_id: selectedTest,
        question_text: questionText,
        options: options,
        correct_answer: correctAnswer,
        difficulty: difficulty,
        created_by: userId,
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

  const handleEdit = (question: Question) => {
    setEditingQuestionId(question.id);
    setEditQuestionText(question.question_text);
    setEditOptions([...question.options]);
    setEditCorrectAnswer(question.correct_answer);
    setEditDifficulty(question.difficulty);
  };

  const handleUpdate = async () => {
    if (!editingQuestionId || !editQuestionText.trim() || editOptions.some(o => !o.trim())) {
      toast({
        title: 'Error',
        description: 'Please fill all fields',
        variant: 'destructive',
      });
      return;
    }

    const { error } = await supabase
      .from('questions')
      .update({
        question_text: editQuestionText,
        options: editOptions,
        correct_answer: editCorrectAnswer,
        difficulty: editDifficulty,
      })
      .eq('id', editingQuestionId);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update question',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Question updated successfully',
      });
      
      await supabase.from('audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: `Updated question`,
      });
      
      setEditingQuestionId(null);
      fetchQuestions();
    }
  };

  const cancelEdit = () => {
    setEditingQuestionId(null);
    setEditQuestionText('');
    setEditOptions([]);
    setEditCorrectAnswer(0);
    setEditDifficulty('medium');
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

    if (!selectedTest) {
      toast({
        title: 'Error',
        description: 'Please select a test first before importing questions',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

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

      if (questions.length === 0) {
        toast({
          title: 'Error',
          description: 'No questions found in file. Check the format matches the template.',
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      // Validate questions - test_id is auto-assigned from selected test
      const validQuestions = questions.filter(q => 
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
          description: `No valid questions found. Each question needs: question_text, options (2+), and correct_answer (0-based index). Found ${questions.length} row(s) but none passed validation.`,
          variant: 'destructive',
        });
        setImporting(false);
        return;
      }

      const userId = (await supabase.auth.getUser()).data.user?.id;
      
      const { error } = await supabase
        .from('questions')
        .insert(validQuestions.map(q => ({
          test_id: q.test_id || selectedTest,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty || 'medium',
          is_reviewed: false,
          created_by: userId,
        })));

      if (error) {
        console.error('Import error:', error);
        toast({
          title: 'Error',
          description: `Failed to import: ${error.message}`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `Imported ${validQuestions.length} questions (pending review)`,
        });
        
        await supabase.from('audit_log').insert({
          admin_id: (await supabase.auth.getUser()).data.user?.id,
          action: `Bulk imported ${validQuestions.length} questions`,
        });

        fetchQuestions();
        setShowImportDialog(false);
      }
    } catch (error) {
      console.error('File parse error:', error);
      toast({
        title: 'Error',
        description: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const questions: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      const question: any = {};

      headers.forEach((header, index) => {
        const value = values[index] || '';
        if (header === 'options') {
          question[header] = value.split('|').map(o => o.trim()).filter(o => o);
        } else if (header === 'correct_answer') {
          question[header] = parseInt(value, 10);
        } else {
          question[header] = value;
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

  
  const filteredQuestions = questions.filter(question => {
    const matchesSearch = question.question_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          question.options.some(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTest = filterTest === 'all' || question.tests.title === filterTest;
    const matchesDifficulty = filterDifficulty === 'all' || question.difficulty === filterDifficulty;
    const matchesReviewStatus = filterReviewStatus === 'all' || 
                                 (filterReviewStatus === 'pending' && !question.is_reviewed) ||
                                 (filterReviewStatus === 'reviewed' && question.is_reviewed);
    
    return matchesSearch && matchesTest && matchesDifficulty && matchesReviewStatus;
  });

  const pendingCount = questions.filter(q => !q.is_reviewed).length;

  const clearFilters = () => {
    setSearchTerm('');
    setFilterTest('all');
    setFilterDifficulty('all');
    setFilterReviewStatus('all');
  };

  const handleApproveQuestion = async (questionId: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    
    const { error } = await supabase
      .from('questions')
      .update({
        is_reviewed: true,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', questionId);

    if (!error) {
      toast({
        title: 'Success',
        description: 'Question approved successfully',
      });
      
      await supabase.from('audit_log').insert({
        admin_id: user?.id,
        action: `Approved question`,
      });
      
      fetchQuestions();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to approve question',
        variant: 'destructive',
      });
    }
  };

  const handleBatchApprove = async () => {
    if (selectedQuestions.size === 0) return;
    
    const user = (await supabase.auth.getUser()).data.user;

    const { error } = await supabase
      .from('questions')
      .update({
        is_reviewed: true,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', Array.from(selectedQuestions));

    if (!error) {
      toast({
        title: 'Success',
        description: `Approved ${selectedQuestions.size} questions successfully`,
      });
      
      await supabase.from('audit_log').insert({
        admin_id: user?.id,
        action: `Batch approved ${selectedQuestions.size} questions`,
      });
      
      setSelectedQuestions(new Set());
      setSelectAll(false);
      fetchQuestions();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to approve questions',
        variant: 'destructive',
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedQuestions(new Set());
      setSelectAll(false);
    } else {
      const allIds = new Set(filteredQuestions.map(q => q.id));
      setSelectedQuestions(allIds);
      setSelectAll(true);
    }
  };

  const toggleQuestionSelection = (questionId: string) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(questionId)) {
      newSelected.delete(questionId);
    } else {
      newSelected.add(questionId);
    }
    setSelectedQuestions(newSelected);
    setSelectAll(newSelected.size === filteredQuestions.length);
  };

  const handleBatchDelete = async () => {
    if (selectedQuestions.size === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${selectedQuestions.size} question(s)?`)) {
      return;
    }

    const { error } = await supabase
      .from('questions')
      .delete()
      .in('id', Array.from(selectedQuestions));

    if (!error) {
      toast({
        title: 'Success',
        description: `Deleted ${selectedQuestions.size} questions successfully`,
      });
      
      await supabase.from('audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: `Batch deleted ${selectedQuestions.size} questions`,
      });
      
      setSelectedQuestions(new Set());
      setSelectAll(false);
      fetchQuestions();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to delete questions',
        variant: 'destructive',
      });
    }
  };

  const handleBatchUpdateDifficulty = async (difficulty: string) => {
    if (selectedQuestions.size === 0) return;

    const { error } = await supabase
      .from('questions')
      .update({ difficulty })
      .in('id', Array.from(selectedQuestions));

    if (!error) {
      toast({
        title: 'Success',
        description: `Updated ${selectedQuestions.size} questions to ${difficulty}`,
      });
      
      await supabase.from('audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: `Batch updated ${selectedQuestions.size} questions difficulty to ${difficulty}`,
      });
      
      setSelectedQuestions(new Set());
      setSelectAll(false);
      fetchQuestions();
    } else {
      toast({
        title: 'Error',
        description: 'Failed to update questions',
        variant: 'destructive',
      });
    }
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

      <AIQuestionGenerator tests={tests} onQuestionsGenerated={fetchQuestions} />

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search & Filter Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search questions or options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Filter by Test</Label>
              <Select value={filterTest} onValueChange={setFilterTest}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tests</SelectItem>
                  {tests.map((test) => (
                    <SelectItem key={test.id} value={test.title}>
                      {test.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Filter by Difficulty</Label>
              <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Difficulties</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Filter by Review Status</Label>
              <Select value={filterReviewStatus} onValueChange={setFilterReviewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending Review ({pendingCount})</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={clearFilters}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <Clock className="h-4 w-4 text-yellow-600" />
              <span className="text-sm text-yellow-700 dark:text-yellow-400">
                {pendingCount} question{pendingCount !== 1 ? 's' : ''} pending review
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-auto"
                onClick={() => setFilterReviewStatus('pending')}
              >
                View Pending
              </Button>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            Showing {filteredQuestions.length} of {questions.length} questions
          </div>
        </CardContent>
      </Card>

      {filteredQuestions.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                >
                  {selectAll ? (
                    <CheckSquare className="mr-2 h-4 w-4" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  {selectAll ? 'Deselect All' : 'Select All'}
                </Button>
                {selectedQuestions.size > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedQuestions.size} selected
                  </span>
                )}
              </div>

              {selectedQuestions.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-sm">Batch Actions:</Label>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleBatchApprove}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve Selected
                  </Button>
                  <Select onValueChange={handleBatchUpdateDifficulty}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Set Difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Set to Easy</SelectItem>
                      <SelectItem value="medium">Set to Medium</SelectItem>
                      <SelectItem value="hard">Set to Hard</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBatchDelete}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {filteredQuestions.map((question) => (
          <Card key={question.id}>
            <CardHeader>
              {editingQuestionId === question.id ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Editing Question</CardTitle>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleUpdate}>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Question Text</Label>
                    <Textarea
                      value={editQuestionText}
                      onChange={(e) => setEditQuestionText(e.target.value)}
                      placeholder="Enter your question"
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Options</Label>
                    {editOptions.map((option, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...editOptions];
                            newOptions[index] = e.target.value;
                            setEditOptions(newOptions);
                          }}
                          placeholder={`Option ${index + 1}`}
                        />
                        <Button
                          type="button"
                          variant={editCorrectAnswer === index ? 'default' : 'outline'}
                          onClick={() => setEditCorrectAnswer(index)}
                        >
                          {editCorrectAnswer === index ? '✓ Correct' : 'Set Correct'}
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div>
                    <Label>Difficulty</Label>
                    <Select value={editDifficulty} onValueChange={setEditDifficulty}>
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
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="pt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleQuestionSelection(question.id)}
                      className="h-8 w-8"
                    >
                      {selectedQuestions.has(question.id) ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <span>{question.tests.title}</span>
                      <span>•</span>
                      <span className="capitalize">{question.difficulty}</span>
                      <span>•</span>
                      {question.is_reviewed ? (
                        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" />
                          Reviewed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                          <Clock className="h-3 w-3" />
                          Pending Review
                        </span>
                      )}
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
                  <div className="flex gap-2">
                    {!question.is_reviewed && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleApproveQuestion(question.id)}
                        title="Approve question"
                      >
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(question)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(question.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <div className="flex items-center justify-between">
              <AlertDialogTitle>Bulk Import Questions</AlertDialogTitle>
              <Button variant="outline" size="sm" onClick={() => setShowImportDialog(false)}>
                <X className="mr-1 h-4 w-4" />
                Back
              </Button>
            </div>
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