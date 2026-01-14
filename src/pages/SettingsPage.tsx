import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Settings, 
  Globe, 
  HelpCircle, 
  FileCheck,
  Loader2,
  Save
} from 'lucide-react';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [defaultLanguage, setDefaultLanguage] = useState('english');
  const [includeInterviewQuestions, setIncludeInterviewQuestions] = useState(true);
  const [includeAtsScore, setIncludeAtsScore] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setDefaultLanguage(data.default_language);
        setIncludeInterviewQuestions(data.include_interview_questions);
        setIncludeAtsScore(data.include_ats_score);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          default_language: defaultLanguage,
          include_interview_questions: includeInterviewQuestions,
          include_ats_score: includeAtsScore,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      toast.success('Settings saved successfully! ✅');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 lg:p-8 space-y-6 max-w-2xl">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-7 h-7 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize your message generation preferences
          </p>
        </div>

        {/* Language Settings */}
        <Card className="animate-slide-up shadow-lg border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Language Preferences
            </CardTitle>
            <CardDescription>
              Choose the default language for generated messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language">Default Message Language</Label>
              <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                <SelectTrigger id="language" className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">
                    <div className="flex items-center gap-2">
                      <span>🇬🇧</span>
                      <span>English Only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="tamil">
                    <div className="flex items-center gap-2">
                      <span>🇮🇳</span>
                      <span>Tamil Only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="both">
                    <div className="flex items-center gap-2">
                      <span>🌐</span>
                      <span>Both (English + Tamil)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                This will be the default selection when generating new messages
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Message Content Settings */}
        <Card className="animate-slide-up shadow-lg border-border/50" style={{ animationDelay: '0.1s' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Message Content
            </CardTitle>
            <CardDescription>
              Choose what to include in generated messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="space-y-1">
                <Label htmlFor="interview-questions" className="font-medium cursor-pointer">
                  Include Interview Questions
                </Label>
                <p className="text-sm text-muted-foreground">
                  Add 5-8 relevant interview questions based on the candidate's skills
                </p>
              </div>
              <Switch
                id="interview-questions"
                checked={includeInterviewQuestions}
                onCheckedChange={setIncludeInterviewQuestions}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="ats-score" className="font-medium cursor-pointer">
                    Include ATS Score Estimate
                  </Label>
                  <span className="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded-full">
                    Optional
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Provide an estimated ATS compatibility score for the resume
                </p>
              </div>
              <Switch
                id="ats-score"
                checked={includeAtsScore}
                onCheckedChange={setIncludeAtsScore}
              />
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <Button
            variant="gradient"
            size="lg"
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>

        {/* Info Card */}
        <Card className="animate-slide-up bg-primary/5 border-primary/20" style={{ animationDelay: '0.3s' }}>
          <CardContent className="flex items-start gap-4 pt-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-1">About Generated Messages</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All messages include a disclaimer stating that the guidance is general and not guaranteed. 
                Messages are crafted to be professional, motivating, and WhatsApp-friendly. 
                They help build trust with your customers while providing genuine value.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
