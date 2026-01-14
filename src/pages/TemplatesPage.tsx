import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Plus, 
  Loader2, 
  Save, 
  Trash2, 
  Edit2,
  FileText,
  User,
  Briefcase,
  GraduationCap,
  RefreshCw,
  Sparkles,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  name: string;
  description: string | null;
  customer_type: string;
  tone: string;
  custom_instructions: string | null;
  include_sections: {
    appreciation: boolean;
    feedback: boolean;
    guidance: boolean;
    job_roles: boolean;
    interview_questions: boolean;
    encouragement: boolean;
  };
  is_default: boolean;
  created_at: string;
}

const customerTypes = [
  { value: 'fresher', label: 'Fresher / Fresh Graduate', icon: GraduationCap },
  { value: 'experienced', label: 'Experienced Professional', icon: Briefcase },
  { value: 'career_change', label: 'Career Changer', icon: RefreshCw },
  { value: 'student', label: 'Student / Intern', icon: User },
  { value: 'custom', label: 'Custom', icon: Sparkles },
];

const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly & Casual' },
  { value: 'motivational', label: 'Highly Motivational' },
  { value: 'formal', label: 'Formal & Traditional' },
];

const defaultSections = {
  appreciation: true,
  feedback: true,
  guidance: true,
  job_roles: true,
  interview_questions: true,
  encouragement: true,
};

const TemplatesPage: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerType, setCustomerType] = useState('fresher');
  const [tone, setTone] = useState('professional');
  const [customInstructions, setCustomInstructions] = useState('');
  const [includeSections, setIncludeSections] = useState(defaultSections);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [user]);

  const loadTemplates = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion for the JSONB field
      const typedData = (data || []).map(t => ({
        ...t,
        include_sections: t.include_sections as Template['include_sections']
      }));
      
      setTemplates(typedData);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setCustomerType('fresher');
    setTone('professional');
    setCustomInstructions('');
    setIncludeSections(defaultSections);
    setIsDefault(false);
    setEditingTemplate(null);
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || '');
    setCustomerType(template.customer_type);
    setTone(template.tone);
    setCustomInstructions(template.custom_instructions || '');
    setIncludeSections(template.include_sections || defaultSections);
    setIsDefault(template.is_default);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }

    setSaving(true);
    try {
      const templateData = {
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        customer_type: customerType,
        tone,
        custom_instructions: customInstructions.trim() || null,
        include_sections: includeSections,
        is_default: isDefault,
      };

      if (isDefault) {
        // Unset other defaults first
        await supabase
          .from('message_templates')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }

      if (editingTemplate) {
        const { error } = await supabase
          .from('message_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('Template updated! ✅');
      } else {
        const { error } = await supabase
          .from('message_templates')
          .insert(templateData);

        if (error) throw error;
        toast.success('Template created! ✅');
      }

      setDialogOpen(false);
      resetForm();
      loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      toast.success('Template deleted');
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Failed to delete template');
    }
  };

  const getCustomerTypeIcon = (type: string) => {
    const found = customerTypes.find(t => t.value === type);
    return found ? found.icon : FileText;
  };

  const getCustomerTypeLabel = (type: string) => {
    const found = customerTypes.find(t => t.value === type);
    return found ? found.label : type;
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-7 h-7 text-primary" />
              Message Templates
            </h1>
            <p className="text-muted-foreground mt-1">
              Create custom templates for different customer types
            </p>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button variant="gradient" size="lg">
                <Plus className="w-5 h-5" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? 'Edit Template' : 'Create New Template'}
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Fresher Friendly"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-type">Customer Type</Label>
                    <Select value={customerType} onValueChange={setCustomerType}>
                      <SelectTrigger id="customer-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {customerTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="w-4 h-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="Brief description of this template"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone">Message Tone</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger id="tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions">Custom AI Instructions</Label>
                  <Textarea
                    id="instructions"
                    placeholder="Add any specific instructions for the AI. E.g., 'Focus on IT skills', 'Mention local job fairs', etc."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <Label>Include Sections</Label>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { key: 'appreciation', label: 'Appreciation Message' },
                      { key: 'feedback', label: 'Resume Feedback' },
                      { key: 'guidance', label: 'Career Guidance' },
                      { key: 'job_roles', label: 'Job Role Suggestions' },
                      { key: 'interview_questions', label: 'Interview Questions' },
                      { key: 'encouragement', label: 'Final Encouragement' },
                    ].map(({ key, label }) => (
                      <div
                        key={key}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <Label htmlFor={key} className="cursor-pointer text-sm">
                          {label}
                        </Label>
                        <Switch
                          id={key}
                          checked={includeSections[key as keyof typeof includeSections]}
                          onCheckedChange={(checked) =>
                            setIncludeSections((prev) => ({ ...prev, [key]: checked }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="space-y-1">
                    <Label htmlFor="default" className="cursor-pointer font-medium flex items-center gap-2">
                      <Star className="w-4 h-4 text-accent" />
                      Set as Default Template
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      This template will be pre-selected when generating messages
                    </p>
                  </div>
                  <Switch
                    id="default"
                    checked={isDefault}
                    onCheckedChange={setIsDefault}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="gradient" onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {editingTemplate ? 'Update Template' : 'Create Template'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Templates Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Card className="animate-slide-up">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Templates Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                Create custom templates to personalize messages for different customer types
              </p>
              <Button variant="gradient" onClick={() => setDialogOpen(true)}>
                <Plus className="w-5 h-5" />
                Create Your First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template, index) => {
              const Icon = getCustomerTypeIcon(template.customer_type);
              return (
                <Card
                  key={template.id}
                  className={cn(
                    "animate-slide-up hover:shadow-lg transition-all cursor-pointer group",
                    template.is_default && "ring-2 ring-primary/30"
                  )}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {template.name}
                            {template.is_default && (
                              <Star className="w-4 h-4 text-accent fill-accent" />
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {getCustomerTypeLabel(template.customer_type)}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {template.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs px-2 py-1 bg-secondary rounded-full text-secondary-foreground">
                        {template.tone}
                      </span>
                      {Object.entries(template.include_sections || {}).filter(([, v]) => v).length < 6 && (
                        <span className="text-xs px-2 py-1 bg-muted rounded-full text-muted-foreground">
                          Custom sections
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openEditDialog(template)}
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TemplatesPage;
