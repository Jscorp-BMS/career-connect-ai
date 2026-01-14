import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Search, 
  Loader2, 
  Copy, 
  Check, 
  MessageSquare,
  User,
  Phone,
  Calendar,
  Globe,
  Cpu,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryItem {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  generated_message: string;
  language: string;
  model_used: string;
  created_at: string;
}

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<HistoryItem | null>(null);

  useEffect(() => {
    loadHistory();
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems(historyItems);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredItems(
        historyItems.filter(
          (item) =>
            item.customer_name.toLowerCase().includes(query) ||
            (item.customer_phone && item.customer_phone.includes(query))
        )
      );
    }
  }, [searchQuery, historyItems]);

  const loadHistory = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: customers } = await supabase
        .from('customers')
        .select('id, full_name, phone')
        .eq('user_id', user.id);

      if (!customers || customers.length === 0) {
        setHistoryItems([]);
        return;
      }

      const customerIds = customers.map(c => c.id);
      const customerMap = Object.fromEntries(
        customers.map(c => [c.id, { name: c.full_name, phone: c.phone }])
      );

      const { data: resumes } = await supabase
        .from('resumes')
        .select('id, customer_id')
        .in('customer_id', customerIds);

      if (!resumes || resumes.length === 0) {
        setHistoryItems([]);
        return;
      }

      const resumeIds = resumes.map(r => r.id);
      const resumeToCustomer = Object.fromEntries(
        resumes.map(r => [r.id, r.customer_id])
      );

      const { data: messages } = await supabase
        .from('ai_messages')
        .select('*')
        .in('resume_id', resumeIds)
        .order('created_at', { ascending: false });

      if (messages) {
        const formattedMessages = messages.map(m => {
          const customerId = resumeToCustomer[m.resume_id];
          const customer = customerMap[customerId] || { name: 'Unknown', phone: null };
          return {
            id: m.id,
            customer_name: customer.name,
            customer_phone: customer.phone,
            generated_message: m.generated_message,
            language: m.language,
            model_used: m.model_used,
            created_at: m.created_at,
          };
        });
        setHistoryItems(formattedMessages);
      }
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
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getLanguageLabel = (lang: string) => {
    switch (lang) {
      case 'english':
        return 'English';
      case 'tamil':
        return 'Tamil';
      case 'both':
        return 'Both';
      default:
        return lang;
    }
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-8 space-y-6">
        {/* Header */}
        <div className="animate-fade-in">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Message History</h1>
          <p className="text-muted-foreground mt-1">
            View and search all previously generated messages
          </p>
        </div>

        {/* Search */}
        <div className="animate-slide-up">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* History List */}
        <Card className="animate-slide-up shadow-lg border-border/50" style={{ animationDelay: '0.1s' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              All Messages
            </CardTitle>
            <CardDescription>
              {filteredItems.length} message{filteredItems.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No messages found</p>
                <p className="text-sm">
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Generate your first message from the dashboard'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-5 bg-muted/30 rounded-xl border border-border/50 hover:bg-muted/50 transition-all duration-200 animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Customer Info */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-foreground">
                              {item.customer_name}
                            </span>
                          </div>
                          {item.customer_phone && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-4 h-4" />
                              {item.customer_phone}
                            </div>
                          )}
                        </div>

                        {/* Meta Info */}
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(item.created_at)}
                          </div>
                          <span className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 text-primary rounded-full">
                            <Globe className="w-3 h-3" />
                            {getLanguageLabel(item.language)}
                          </span>
                          <span className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 text-accent rounded-full">
                            <Cpu className="w-3 h-3" />
                            {item.model_used}
                          </span>
                        </div>

                        {/* Message Preview */}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.generated_message}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedMessage(item)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="whatsapp"
                          size="sm"
                          onClick={() => copyToClipboard(item.generated_message, item.id)}
                        >
                          {copiedId === item.id ? (
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Message Dialog */}
        <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Message for {selectedMessage?.customer_name}
              </DialogTitle>
            </DialogHeader>
            {selectedMessage && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 text-sm">
                  {selectedMessage.customer_phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      {selectedMessage.customer_phone}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    {formatDate(selectedMessage.created_at)}
                  </div>
                  <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">
                    {getLanguageLabel(selectedMessage.language)}
                  </span>
                  <span className="px-2 py-1 bg-accent/10 text-accent rounded-full text-xs">
                    {selectedMessage.model_used}
                  </span>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed border border-border/50">
                  {selectedMessage.generated_message}
                </div>
                <Button
                  variant="whatsapp"
                  className="w-full"
                  onClick={() => {
                    copyToClipboard(selectedMessage.generated_message, selectedMessage.id);
                  }}
                >
                  {copiedId === selectedMessage.id ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied to Clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Message
                    </>
                  )}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default HistoryPage;
