import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface RequestBody {
  resumeId: string;
  customerName: string;
  language: string;
  includeQuestions: boolean;
  fileUrl: string;
  fileType: string;
  templateId?: string;
}

interface TemplateSections {
  appreciation: boolean;
  feedback: boolean;
  guidance: boolean;
  job_roles: boolean;
  interview_questions: boolean;
  encouragement: boolean;
}

interface Template {
  id: string;
  name: string;
  customer_type: string;
  tone: string;
  custom_instructions: string | null;
  include_sections: TemplateSections;
}

// Improved PDF text extraction using multiple methods
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  const extractedParts: string[] = [];
  
  // Method 1: Extract text between BT and ET operators (text blocks)
  const btEtPattern = /BT\s*([\s\S]*?)\s*ET/g;
  let match;
  while ((match = btEtPattern.exec(text)) !== null) {
    const textBlock = match[1];
    // Extract text from Tj and TJ operators
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjPattern.exec(textBlock)) !== null) {
      const decoded = tjMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\');
      if (decoded.trim()) {
        extractedParts.push(decoded);
      }
    }
    
    // Extract from TJ arrays
    const tjArrayPattern = /\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/gi;
    let tjArrayMatch;
    while ((tjArrayMatch = tjArrayPattern.exec(textBlock)) !== null) {
      const arrayContent = tjArrayMatch[1];
      const stringPattern = /\(([^)]*)\)/g;
      let stringMatch;
      while ((stringMatch = stringPattern.exec(arrayContent)) !== null) {
        const decoded = stringMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        if (decoded.trim()) {
          extractedParts.push(decoded);
        }
      }
    }
  }
  
  // Method 2: Extract from stream objects
  const streamPattern = /stream\s*([\s\S]*?)\s*endstream/gi;
  while ((match = streamPattern.exec(text)) !== null) {
    const streamContent = match[1];
    // Look for readable text patterns
    const readablePattern = /\(([A-Za-z0-9\s,.@\-+()/:;!?'"]+)\)/g;
    let readableMatch;
    while ((readableMatch = readablePattern.exec(streamContent)) !== null) {
      if (readableMatch[1].length > 3 && /[a-zA-Z]{2,}/.test(readableMatch[1])) {
        extractedParts.push(readableMatch[1]);
      }
    }
  }
  
  // Method 3: Look for common resume keywords in any parentheses
  const keywordPattern = /\(((?:[^()\\]|\\[()\\])*(?:experience|education|skills?|work|job|project|summary|objective|email|phone|address|university|college|degree|bachelor|master|engineer|developer|manager|analyst|intern|certification)[^()]*)\)/gi;
  while ((match = keywordPattern.exec(text)) !== null) {
    extractedParts.push(match[1]);
  }
  
  // Clean and deduplicate
  const cleanedText = extractedParts
    .map(part => part.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim())
    .filter(part => part.length > 2)
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .join(' ');
  
  // Final cleanup
  return cleanedText
    .replace(/\s+/g, ' ')
    .replace(/\s([.,;:!?])/g, '$1')
    .trim();
}

// Extract text from DOCX (ZIP-based XML format)
async function extractTextFromDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(arrayBuffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  const extractedParts: string[] = [];
  
  // Look for text content in XML tags
  // <w:t> tags contain the actual text in DOCX
  const wtPattern = /<w:t[^>]*>([^<]+)<\/w:t>/gi;
  let match;
  while ((match = wtPattern.exec(text)) !== null) {
    if (match[1].trim()) {
      extractedParts.push(match[1]);
    }
  }
  
  // Also look for general text patterns
  if (extractedParts.length < 10) {
    const generalPattern = />([A-Za-z0-9][^<]{3,200})</g;
    while ((match = generalPattern.exec(text)) !== null) {
      const content = match[1].trim();
      if (content.length > 5 && /[a-zA-Z]{3,}/.test(content)) {
        extractedParts.push(content);
      }
    }
  }
  
  return extractedParts
    .filter((part, index, arr) => arr.indexOf(part) === index)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractTextFromFile(fileUrl: string, fileType: string): Promise<string> {
  try {
    console.log(`Fetching file: ${fileUrl}, type: ${fileType}`);
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch file: ${response.status}`);
      throw new Error(`Failed to fetch file: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`File size: ${arrayBuffer.byteLength} bytes`);
    
    let extractedText = "";
    
    if (fileType === "pdf") {
      extractedText = await extractTextFromPDF(arrayBuffer);
    } else {
      extractedText = await extractTextFromDOCX(arrayBuffer);
    }
    
    console.log(`Extracted text length: ${extractedText.length} characters`);
    
    // If extraction failed or got too little text, provide context
    if (extractedText.length < 100) {
      console.log("Extraction yielded limited text, adding context");
      return `Resume uploaded (${fileType.toUpperCase()} format). The text extraction was limited, but please provide general career guidance for a job seeker. Original extracted content: ${extractedText}`;
    }
    
    // Limit text length for API
    return extractedText.substring(0, 15000);
  } catch (error) {
    console.error("Error extracting text:", error);
    return `Resume file uploaded (${fileType.toUpperCase()} format). Unable to fully extract text. Please provide general career guidance and resume tips for a job seeker.`;
  }
}

function buildPrompt(
  customerName: string,
  extractedText: string,
  language: string,
  includeQuestions: boolean,
  includeAtsScore: boolean,
  template?: Template | null
): string {
  const languageInstruction = language === "tamil" 
    ? "Write the entire message in Tamil language only."
    : language === "both"
    ? "Write the message in both English and Tamil. First provide the English version, then the Tamil version."
    : "Write the entire message in English only.";

  // Use template settings if provided
  const sections = template?.include_sections || {
    appreciation: true,
    feedback: true,
    guidance: true,
    job_roles: true,
    interview_questions: includeQuestions,
    encouragement: true,
  };
  
  const tone = template?.tone || "professional";
  const toneInstruction = {
    professional: "Use a professional yet warm tone.",
    friendly: "Use a very friendly and casual tone, like talking to a friend.",
    motivational: "Use a highly motivational and inspiring tone with extra encouragement.",
    formal: "Use a formal and traditional business communication style.",
  }[tone] || "Use a professional yet warm tone.";

  const customerTypeContext = template?.customer_type ? {
    fresher: "This is a fresher/fresh graduate with little to no work experience. Focus on their education, skills, and potential.",
    experienced: "This is an experienced professional. Focus on their career progression and expertise.",
    career_change: "This person is changing careers. Acknowledge their transferable skills and courage to make a change.",
    student: "This is a student or intern. Be encouraging about their academic journey and early career steps.",
    custom: "",
  }[template.customer_type] : "";

  let prompt = `You are a friendly shop assistant at a Xerox/Printout shop called "Fintech BMS". A customer named ${customerName} has just had their resume printed.

${customerTypeContext}
${toneInstruction}
${template?.custom_instructions ? `\nADDITIONAL INSTRUCTIONS: ${template.custom_instructions}` : ""}

Analyze the following resume and generate a WhatsApp-ready message that builds trust and provides value:

RESUME CONTENT:
${extractedText}

Generate a message that includes:
`;

  if (sections.appreciation) {
    prompt += `
✅ Appreciation Message:
- Thank them warmly for choosing our shop
- Use a friendly, ${tone} tone`;
  }

  if (sections.feedback) {
    prompt += `

✅ Short Resume Feedback:
- Provide 2-3 positive observations about their resume
- Mention any standout skills or experience`;
  }

  if (sections.guidance) {
    prompt += `

✅ Career Guidance/Tips:
- Give 2-3 actionable career tips relevant to their profile
- Keep it encouraging and practical`;
  }

  if (sections.job_roles) {
    prompt += `

✅ Job Role Suggestions:
- Suggest 3-5 job roles that match their profile
- Be specific based on their skills and experience`;
  }

  if (sections.interview_questions) {
    prompt += `

✅ Interview Questions Section:
- Include 5-8 interview questions relevant to the candidate's skills and experience
- Questions should be practical and commonly asked in interviews for their field
- Format as a numbered list`;
  }

  if (includeAtsScore) {
    prompt += `

✅ ATS Score Section:
- Provide an estimated ATS (Applicant Tracking System) compatibility score out of 100
- Briefly explain what could improve the score`;
  }

  if (sections.encouragement) {
    prompt += `

✅ Final Encouragement:
- End with a motivating message
- Wish them success in their job search`;
  }

  prompt += `

IMPORTANT RULES:
1. ${languageInstruction}
2. Keep the message concise and WhatsApp-friendly (easy to read on mobile)
3. Use light emojis: ✅ 🔥 🙏 🙂 👍 💼 📝 (don't overuse)
4. NO fake claims like "you got selected" or "interview scheduled"
5. MUST include this disclaimer at the end: "📝 Note: This is general guidance based on your resume. Results may vary. Best wishes! 🙏"
6. Keep it professional but warm - like a helpful friend
7. Format for WhatsApp: Use line breaks, avoid complex formatting

Generate the WhatsApp message now:`;

  return prompt;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { resumeId, customerName, language, includeQuestions, fileUrl, fileType, templateId }: RequestBody = await req.json();

    console.log("Request received:", { resumeId, customerName, language, includeQuestions, fileType, templateId });

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user settings for ATS score preference
    const authHeader = req.headers.get("Authorization");
    let includeAtsScore = false;
    let template: Template | null = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("include_ats_score")
          .eq("user_id", user.id)
          .single();
        
        includeAtsScore = settings?.include_ats_score || false;
        
        // Fetch template if provided
        if (templateId) {
          const { data: templateData } = await supabase
            .from("message_templates")
            .select("*")
            .eq("id", templateId)
            .eq("user_id", user.id)
            .single();
          
          if (templateData) {
            template = templateData as Template;
            console.log("Using template:", template.name);
          }
        }
      }
    }

    // Extract text from the resume
    console.log("Extracting text from resume...");
    const extractedText = await extractTextFromFile(fileUrl, fileType);
    console.log("Extracted text preview:", extractedText.substring(0, 200));

    // Update resume with extracted text
    await supabase
      .from("resumes")
      .update({ extracted_text: extractedText.substring(0, 50000) })
      .eq("id", resumeId);

    // Build the prompt
    const prompt = buildPrompt(customerName, extractedText, language, includeQuestions, includeAtsScore, template);

    // Call AI Gateway - Try Gemini first
    let modelUsed = "gemini";
    let generatedMessage = "";

    try {
      console.log("Calling Gemini API...");
      const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "You are a helpful assistant that generates WhatsApp-ready messages for a Xerox shop. Be friendly, professional, and encouraging. Always provide actionable career advice." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini API error:", geminiResponse.status, errorText);
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiData = await geminiResponse.json();
      generatedMessage = geminiData.choices?.[0]?.message?.content || "";

      if (!generatedMessage) {
        throw new Error("Empty response from Gemini");
      }
      
      console.log("Gemini response received, length:", generatedMessage.length);
    } catch (geminiError) {
      console.error("Gemini failed, trying fallback:", geminiError);
      
      // Fallback to another model (using GPT-5-mini as Groq equivalent)
      modelUsed = "groq";
      
      const fallbackResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5-mini",
          messages: [
            { role: "system", content: "You are a helpful assistant that generates WhatsApp-ready messages for a Xerox shop. Be friendly, professional, and encouraging. Always provide actionable career advice." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!fallbackResponse.ok) {
        const errorText = await fallbackResponse.text();
        console.error("Fallback API error:", fallbackResponse.status, errorText);
        
        if (fallbackResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (fallbackResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`Fallback API error: ${fallbackResponse.status}`);
      }

      const fallbackData = await fallbackResponse.json();
      generatedMessage = fallbackData.choices?.[0]?.message?.content || "";

      if (!generatedMessage) {
        throw new Error("Empty response from fallback model");
      }
      
      console.log("Fallback response received, length:", generatedMessage.length);
    }

    // Save the generated message to database
    const { error: insertError } = await supabase
      .from("ai_messages")
      .insert({
        resume_id: resumeId,
        language,
        generated_message: generatedMessage,
        model_used: modelUsed,
        include_interview_questions: includeQuestions,
        template_id: templateId || null,
      });

    if (insertError) {
      console.error("Error saving message:", insertError);
    }

    return new Response(
      JSON.stringify({ 
        message: generatedMessage, 
        model_used: modelUsed 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-message function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate message" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
