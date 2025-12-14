import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Save, 
  RefreshCw, 
  Settings, 
  GraduationCap, 
  Mail, 
  Shield,
  Loader2
} from 'lucide-react';

interface TestDefaults {
  defaultDuration: number;
  defaultQuestionCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

interface PassThresholds {
  passPercentage: number;
  excellentPercentage: number;
  showResultsImmediately: boolean;
}

interface EmailSettings {
  enableNotifications: boolean;
  adminEmailOnTestComplete: boolean;
  studentEmailOnTestComplete: boolean;
}

interface PlatformSettings {
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
  requireAdminApproval: boolean;
}

const SystemConfigPanel = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testDefaults, setTestDefaults] = useState<TestDefaults>({
    defaultDuration: 30,
    defaultQuestionCount: 10,
    shuffleQuestions: true,
    shuffleOptions: true,
  });
  const [passThresholds, setPassThresholds] = useState<PassThresholds>({
    passPercentage: 50,
    excellentPercentage: 80,
    showResultsImmediately: true,
  });
  const [emailSettings, setEmailSettings] = useState<EmailSettings>({
    enableNotifications: false,
    adminEmailOnTestComplete: false,
    studentEmailOnTestComplete: false,
  });
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>({
    maintenanceMode: false,
    allowNewRegistrations: true,
    requireAdminApproval: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value');

    if (error) {
      console.error('Error fetching config:', error);
      toast({
        title: 'Error',
        description: 'Failed to load system configuration',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    data?.forEach((config: { key: string; value: any }) => {
      switch (config.key) {
        case 'test_defaults':
          setTestDefaults(config.value as TestDefaults);
          break;
        case 'pass_thresholds':
          setPassThresholds(config.value as PassThresholds);
          break;
        case 'email_settings':
          setEmailSettings(config.value as EmailSettings);
          break;
        case 'platform_settings':
          setPlatformSettings(config.value as PlatformSettings);
          break;
      }
    });
    setLoading(false);
  };

  const saveConfig = async (key: string, value: any) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('system_config')
      .update({ 
        value, 
        updated_at: new Date().toISOString(),
        updated_by: user?.id 
      })
      .eq('key', key);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to save configuration',
        variant: 'destructive',
      });
      setSaving(false);
      return;
    }

    // Log the action
    if (user) {
      await supabase.from('audit_log').insert({
        admin_id: user.id,
        action: `Updated system config: ${key}`,
      });
    }

    toast({
      title: 'Saved',
      description: 'Configuration updated successfully',
    });
    setSaving(false);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    await Promise.all([
      saveConfig('test_defaults', testDefaults),
      saveConfig('pass_thresholds', passThresholds),
      saveConfig('email_settings', emailSettings),
      saveConfig('platform_settings', platformSettings),
    ]);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">System Configuration</h2>
          <p className="text-sm text-slate-500">Manage platform-wide settings and defaults</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchConfig}
            disabled={saving}
            className="border-blue-300 text-blue-600 hover:bg-blue-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Defaults */}
        <Card className="bg-white border-blue-100 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Settings className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base text-slate-800">Test Defaults</CardTitle>
                <CardDescription className="text-xs">Default settings for new tests</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-slate-600">Default Duration (min)</Label>
                <Input
                  type="number"
                  value={testDefaults.defaultDuration}
                  onChange={(e) => setTestDefaults({ ...testDefaults, defaultDuration: parseInt(e.target.value) || 30 })}
                  className="bg-white border-blue-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-slate-600">Default Questions</Label>
                <Input
                  type="number"
                  value={testDefaults.defaultQuestionCount}
                  onChange={(e) => setTestDefaults({ ...testDefaults, defaultQuestionCount: parseInt(e.target.value) || 10 })}
                  className="bg-white border-blue-200"
                />
              </div>
            </div>
            <Separator className="bg-blue-100" />
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">Shuffle Questions</Label>
              <Switch
                checked={testDefaults.shuffleQuestions}
                onCheckedChange={(checked) => setTestDefaults({ ...testDefaults, shuffleQuestions: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">Shuffle Answer Options</Label>
              <Switch
                checked={testDefaults.shuffleOptions}
                onCheckedChange={(checked) => setTestDefaults({ ...testDefaults, shuffleOptions: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pass Thresholds */}
        <Card className="bg-white border-blue-100 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base text-slate-800">Pass Thresholds</CardTitle>
                <CardDescription className="text-xs">Score requirements and result settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-slate-600">Pass Percentage (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={passThresholds.passPercentage}
                  onChange={(e) => setPassThresholds({ ...passThresholds, passPercentage: parseInt(e.target.value) || 50 })}
                  className="bg-white border-blue-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm text-slate-600">Excellent Percentage (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={passThresholds.excellentPercentage}
                  onChange={(e) => setPassThresholds({ ...passThresholds, excellentPercentage: parseInt(e.target.value) || 80 })}
                  className="bg-white border-blue-200"
                />
              </div>
            </div>
            <Separator className="bg-blue-100" />
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">Show Results Immediately</Label>
              <Switch
                checked={passThresholds.showResultsImmediately}
                onCheckedChange={(checked) => setPassThresholds({ ...passThresholds, showResultsImmediately: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Email Settings */}
        <Card className="bg-white border-blue-100 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <Mail className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-base text-slate-800">Email Settings</CardTitle>
                <CardDescription className="text-xs">Notification preferences</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">Enable Notifications</Label>
              <Switch
                checked={emailSettings.enableNotifications}
                onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, enableNotifications: checked })}
              />
            </div>
            <Separator className="bg-blue-100" />
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">Email Admin on Test Complete</Label>
              <Switch
                checked={emailSettings.adminEmailOnTestComplete}
                onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, adminEmailOnTestComplete: checked })}
                disabled={!emailSettings.enableNotifications}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-600">Email Student on Test Complete</Label>
              <Switch
                checked={emailSettings.studentEmailOnTestComplete}
                onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, studentEmailOnTestComplete: checked })}
                disabled={!emailSettings.enableNotifications}
              />
            </div>
          </CardContent>
        </Card>

        {/* Platform Settings */}
        <Card className="bg-white border-blue-100 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <Shield className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <CardTitle className="text-base text-slate-800">Platform Settings</CardTitle>
                <CardDescription className="text-xs">Access and security controls</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-600">Maintenance Mode</Label>
                <p className="text-xs text-slate-400">Disable access for non-admins</p>
              </div>
              <Switch
                checked={platformSettings.maintenanceMode}
                onCheckedChange={(checked) => setPlatformSettings({ ...platformSettings, maintenanceMode: checked })}
              />
            </div>
            <Separator className="bg-blue-100" />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-600">Allow New Registrations</Label>
                <p className="text-xs text-slate-400">Enable user signups</p>
              </div>
              <Switch
                checked={platformSettings.allowNewRegistrations}
                onCheckedChange={(checked) => setPlatformSettings({ ...platformSettings, allowNewRegistrations: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-600">Require Admin Approval</Label>
                <p className="text-xs text-slate-400">Admin signups need approval</p>
              </div>
              <Switch
                checked={platformSettings.requireAdminApproval}
                onCheckedChange={(checked) => setPlatformSettings({ ...platformSettings, requireAdminApproval: checked })}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SystemConfigPanel;
