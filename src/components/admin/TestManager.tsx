import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, Link as LinkIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  total_questions: number;
  is_active: boolean;
}

export const TestManager = () => {
  const [tests, setTests] = useState<Test[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState<number>(30);
  const { toast } = useToast();

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    const { data } = await supabase
      .from('tests')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });
    
    if (data) setTests(data);
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a test title',
        variant: 'destructive',
      });
      return;
    }

    const userId = (await supabase.auth.getUser()).data.user?.id;
    
    const { error } = await supabase
      .from('tests')
      .insert({
        title,
        duration_minutes: duration,
        is_active: true,
        created_by: userId,
      });

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to create test',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Test created successfully',
      });
      
      await supabase.from('audit_log').insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action: `Created test: ${title}`,
      });
      
      setTitle('');
      setDuration(30);
      setShowForm(false);
      fetchTests();
    }
  };

  const handleToggleActive = async (testId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('tests')
      .update({ is_active: !currentStatus })
      .eq('id', testId);

    if (!error) {
      toast({
        title: 'Success',
        description: `Test ${!currentStatus ? 'activated' : 'deactivated'}`,
      });
      fetchTests();
    }
  };

  const handleCopyLink = async (testId: string, testTitle: string) => {
    const link = `${window.location.origin}/test/${testId}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({
        title: 'Link copied',
        description: `Share link for "${testTitle}" copied to clipboard`,
      });
    } catch {
      // Fallback for browsers without clipboard API
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      toast({
        title: 'Link copied',
        description: `Share link for "${testTitle}" copied to clipboard`,
      });
    }
  };

  const handleDelete = async (testId: string) => {
    if (!confirm('Are you sure? This will also delete all questions in this test.')) {
      return;
    }

    const { error } = await supabase
      .from('tests')
      .delete()
      .eq('id', testId);

    if (!error) {
      toast({
        title: 'Success',
        description: 'Test deleted successfully',
      });
      fetchTests();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Manage Tests</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" />
          New Test
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="test-title">Test Title</Label>
              <Input
                id="test-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Mathematics Quiz"
              />
            </div>
            <div>
              <Label htmlFor="test-duration">Duration</Label>
              <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">60 minutes</SelectItem>
                  <SelectItem value="120">120 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate}>Create Test</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {tests.map((test) => (
          <Card key={test.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{test.title}</CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="secondary">{test.duration_minutes} min</Badge>
                    <Badge variant="outline">{test.total_questions} questions</Badge>
                    <Badge variant={test.is_active ? 'default' : 'secondary'}>
                      {test.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={test.is_active}
                    onCheckedChange={() => handleToggleActive(test.id, test.is_active)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyLink(test.id, test.title)}
                    title="Copy share link"
                    disabled={!test.is_active}
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDelete(test.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
};