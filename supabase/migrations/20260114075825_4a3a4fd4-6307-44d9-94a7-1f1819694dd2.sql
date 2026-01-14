-- Create message_templates table
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  customer_type TEXT NOT NULL, -- e.g., 'fresher', 'experienced', 'career_change', 'student', 'custom'
  tone TEXT NOT NULL DEFAULT 'professional', -- 'professional', 'friendly', 'motivational', 'formal'
  custom_instructions TEXT, -- Additional instructions for AI
  include_sections JSONB DEFAULT '{"appreciation": true, "feedback": true, "guidance": true, "job_roles": true, "interview_questions": true, "encouragement": true}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own templates"
  ON public.message_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
  ON public.message_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON public.message_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON public.message_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Add template_id to ai_messages for tracking which template was used
ALTER TABLE public.ai_messages ADD COLUMN template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX idx_message_templates_user_id ON public.message_templates(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON public.message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();