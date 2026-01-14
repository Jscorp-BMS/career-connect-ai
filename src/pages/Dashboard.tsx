import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Upload, 
  Loader2, 
  Copy, 
  Check, 
  FileText, 
  User, 
  Phone, 
  Mail,
  MessageSquare,
  Sparkles,
  Clock,
  FileStack
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecentMessage {
  id: string;
  customer_name: string;
  generated_message: string;
  language: string;
  model_used: string;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  customer_type: string;
  is_default: boolean;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('english');
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    loadUserSettings();
    loadRecentMessages();
    loadTemplates();
  }, [user]);

  const loadUserSettings = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setLanguage(data.default_language);
      setIncludeQuestions(data.include_interview_questions);
    }
  };

  const loadTemplates = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('message_templates')
      .select('id, name, customer_type, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false });

    if (data) {
      setTemplates(data);
      // Set default template if exists
      const defaultTemplate = data.find(t => t.is_default);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    }
  };

  const loadRecentMessages = async () => {
    if (!user) return;

    setLoadingRecent(true);
    try {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, full_name')
        .eq('user_id', user.id);

      if (!customers || customers.length === 0) {
        setRecentMessages([]);
        return;
      }

      const customerIds = customers.map(c => c.id);
      const customerMap = Object.fromEntries(customers.map(c => [c.id, c.full_name]));

      const { data: resumes } = await supabase
        .from('resumes')
        .select('id, customer_id')
        .in('customer_id', customerIds);

      if (!resumes || resumes.length === 0) {
        setRecentMessages([]);
        return;
      }

      const resumeIds = resumes.map(r => r.id);
      const resumeToCustomer = Object.fromEntries(resumes.map(r => [r.id, r.customer_id]));

      const { data: messages } = await supabase
        .from('ai_messages')
        .select('*')
        .in('resume_id', resumeIds)
        .order('created_at', { ascending: false })
        .limit(10);

      if (messages) {
        const formattedMessages = messages.map(m => ({
          id: m.id,
          customer_name: customerMap[resumeToCustomer[m.resume_id]] || 'Unknown',
          generated_message: m.generated_message,
          language: m.language,
          model_used: m.model_used,
          created_at: m.created_at,
        }));
        setRecentMessages(formattedMessages);
      }
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error('Please upload a PDF or DOCX file');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error('File size must be less than 10MB');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toast.error('Please enter customer name');
      return;
    }
    if (!file) {
      toast.error('Please upload a resume file');
      return;
    }

    setLoading(true);
    setGeneratedMessage('');

    try {
      // 1. Upload file to storage
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error('Failed to upload file');
      }

      const { data: urlData } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);

      // 2. Create customer record
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: user?.id,
          full_name: customerName,
          phone: customerPhone || null,
          email: customerEmail || null,
        })
        .select()
        .single();

      if (customerError) throw customerError;

      // 3. Create resume record
      const { data: resume, error: resumeError } = await supabase
        .from('resumes')
        .insert({
          customer_id: customer.id,
          file_url: urlData.publicUrl,
          file_type: fileExt === 'pdf' ? 'pdf' : 'docx',
        })
        .select()
        .single();

      if (resumeError) throw resumeError;

      // 4. Call edge function to generate message
      const { data: messageData, error: functionError } = await supabase.functions.invoke('generate-message', {
        body: {
          resumeId: resume.id,
          customerName,
          language,
          includeQuestions,
          fileUrl: urlData.publicUrl,
          fileType: fileExt,
          templateId: selectedTemplateId || undefined,
        },
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to generate message');
      }

      if (messageData?.error) {
        throw new Error(messageData.error);
      }

      setGeneratedMessage(messageData.message);
      toast.success('Message generated successfully! ✅');
      
      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setFile(null);
      
      // Reload recent messages
      loadRecentMessages();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate message');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success('Copied to clipboard! 📋');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-8 space-y-8">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Upload resumes and generate WhatsApp-ready messages for your customers
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload Form */}
          <Card className="animate-slide-up shadow-lg border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Generate Message
              </CardTitle>
              <CardDescription>
                Enter customer details and upload their resume
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Customer Name *
                  </Label>
                  <Input
                    id="name"
                    placeholder="Enter customer's full name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Phone number"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Email address"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resume" className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    Resume File *
                  </Label>
                  <div className="relative">
                    <input
                      id="resume"
                      type="file"
                      accept=".pdf,.docx"
                      onChange={handleFileChange}
                      disabled={loading}
                      className="hidden"
                    />
                    <label
                      htmlFor="resume"
                      className={cn(
                        "flex items-center justify-center gap-3 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all",
                        file
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <Upload className={cn("w-6 h-6", file ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("text-sm", file ? "text-primary font-medium" : "text-muted-foreground")}>
                        {file ? file.name : "Click to upload PDF or DOCX"}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Template Selection */}
                {templates.length > 0 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileStack className="w-4 h-4 text-muted-foreground" />
                      Message Template
                    </Label>
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No template (default)</SelectItem>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} {template.is_default && '⭐'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={language} onValueChange={setLanguage} disabled={loading}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="tamil">Tamil</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Interview Questions</Label>
                    <div className="flex items-center gap-3 h-10">
                      <Switch
                        checked={includeQuestions}
                        onCheckedChange={setIncludeQuestions}
                        disabled={loading}
                      />
                      <span className="text-sm text-muted-foreground">
                        {includeQuestions ? 'Included' : 'Excluded'}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="whatsapp"
                  size="lg"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Message...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-5 h-5" />
                      Generate WhatsApp Message
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Generated Message / Recent Messages */}
          <div className="space-y-6">
            {/* Generated Message Display */}
            {generatedMessage && (
              <Card className="animate-scale-in border-whatsapp/30 bg-whatsapp/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2 text-whatsapp">
                      <MessageSquare className="w-5 h-5" />
                      Generated Message
                    </CardTitle>
                    <Button
                      variant="whatsapp"
                      size="sm"
                      onClick={() => copyToClipboard(generatedMessage, 'new')}
                    >
                      {copiedId === 'new' ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-card rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed border border-border/50 max-h-80 overflow-y-auto">
                    {generatedMessage}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Messages */}
            <Card className="animate-slide-up shadow-lg border-border/50" style={{ animationDelay: '0.1s' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  Recent Messages
                </CardTitle>
                <CardDescription>Last 10 generated messages</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRecent ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recentMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No messages generated yet</p>
                    <p className="text-sm">Upload a resume to get started!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {recentMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-4 bg-muted/50 rounded-lg border border-border/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-foreground truncate">
                                {msg.customer_name}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                {msg.language}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-full">
                                {msg.model_used}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">
                              {formatDate(msg.created_at)}
                            </p>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {msg.generated_message}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => copyToClipboard(msg.generated_message, msg.id)}
                            className="shrink-0"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-4 h-4 text-success" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
