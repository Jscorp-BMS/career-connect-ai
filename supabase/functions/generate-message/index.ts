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
}

async function extractTextFromFile(fileUrl: string, fileType: string): Promise<string> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch file");
    }

    if (fileType === "pdf") {
      // For PDF, we'll use a simple text extraction approach
      // In production, you might want to use a more robust PDF parser
      const arrayBuffer = await response.arrayBuffer();
      const text = new TextDecoder().decode(arrayBuffer);
      
      // Basic PDF text extraction (looks for text between parentheses in PDF format)
      const textContent = text.match(/\((.*?)\)/g)?.map(s => s.slice(1, -1)).join(' ') || '';
      
      // If we can't extract text properly, return a placeholder
      if (textContent.length < 50) {
        return `Resume file from: ${fileUrl}. File type: ${fileType}. Please analyze based on typical resume structure.`;
      }
      return textContent;
    } else {
      // For DOCX, extract text from the XML content
      const arrayBuffer = await response.arrayBuffer();
      const text = new TextDecoder().decode(arrayBuffer);
      
      // Basic extraction of text content
      const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (cleanText.length < 50) {
        return `Resume file from: ${fileUrl}. File type: ${fileType}. Please analyze based on typical resume structure.`;
      }
      return cleanText.substring(0, 10000); // Limit text length
    }
  } catch (error) {
    console.error("Error extracting text:", error);
    return `Resume file from: ${fileUrl}. File type: ${fileType}. Unable to extract full text, please provide general guidance.`;
  }
}

function buildPrompt(
  customerName: string,
  extractedText: string,
  language: string,
  includeQuestions: boolean,
  includeAtsScore: boolean
): string {
  const languageInstruction = language === "tamil" 
    ? "Write the entire message in Tamil language only."
    : language === "both"
    ? "Write the message in both English and Tamil. First provide the English version, then the Tamil version."
    : "Write the entire message in English only.";

  const questionsSection = includeQuestions
    ? `
✅ Interview Questions Section:
- Include 5-8 interview questions relevant to the candidate's skills and experience
- Questions should be practical and commonly asked in interviews for their field
- Format as a numbered list`
    : "";

  const atsSection = includeAtsScore
    ? `
✅ ATS Score Section:
- Provide an estimated ATS (Applicant Tracking System) compatibility score out of 100
- Briefly explain what could improve the score`
    : "";

  return `You are a friendly shop assistant at a Xerox/Printout shop called "Fintech BMS". A customer named ${customerName} has just had their resume printed. 

Analyze the following resume and generate a WhatsApp-ready message that builds trust and provides value:

RESUME CONTENT:
${extractedText}

Generate a message that includes:

✅ Appreciation Message:
- Thank them warmly for choosing our shop
- Use a friendly, professional tone

✅ Short Resume Feedback:
- Provide 2-3 positive observations about their resume
- Mention any standout skills or experience

✅ Career Guidance/Tips:
- Give 2-3 actionable career tips relevant to their profile
- Keep it encouraging and practical

✅ Job Role Suggestions:
- Suggest 3-5 job roles that match their profile
- Be specific based on their skills and experience
${questionsSection}
${atsSection}

✅ Final Encouragement:
- End with a motivating message
- Wish them success in their job search

IMPORTANT RULES:
1. ${languageInstruction}
2. Keep the message concise and WhatsApp-friendly (easy to read on mobile)
3. Use light emojis: ✅ 🔥 🙏 🙂 👍 💼 📝 (don't overuse)
4. NO fake claims like "you got selected" or "interview scheduled"
5. MUST include this disclaimer at the end: "📝 Note: This is general guidance based on your resume. Results may vary. Best wishes! 🙏"
6. Keep it professional but warm - like a helpful friend
7. Format for WhatsApp: Use line breaks, avoid complex formatting

Generate the WhatsApp message now:`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { resumeId, customerName, language, includeQuestions, fileUrl, fileType }: RequestBody = await req.json();

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user settings for ATS score preference
    const authHeader = req.headers.get("Authorization");
    let includeAtsScore = false;
    
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
      }
    }

    // Extract text from the resume
    console.log("Extracting text from resume...");
    const extractedText = await extractTextFromFile(fileUrl, fileType);
    console.log("Extracted text length:", extractedText.length);

    // Update resume with extracted text
    await supabase
      .from("resumes")
      .update({ extracted_text: extractedText.substring(0, 50000) })
      .eq("id", resumeId);

    // Build the prompt
    const prompt = buildPrompt(customerName, extractedText, language, includeQuestions, includeAtsScore);

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
            { role: "system", content: "You are a helpful assistant that generates WhatsApp-ready messages for a Xerox shop. Be friendly, professional, and encouraging." },
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
            { role: "system", content: "You are a helpful assistant that generates WhatsApp-ready messages for a Xerox shop. Be friendly, professional, and encouraging." },
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
