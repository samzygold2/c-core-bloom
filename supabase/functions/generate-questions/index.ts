import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, difficulty, count = 5 } = await req.json();
    
    if (!topic || !difficulty) {
      return new Response(
        JSON.stringify({ error: 'Topic and difficulty are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert test question generator. Generate multiple-choice questions based on the given topic and difficulty level. Each question should have exactly 4 options with only one correct answer. Return your response as valid JSON only.`;

    const userPrompt = `Generate ${count} multiple-choice questions about "${topic}" with ${difficulty} difficulty level. 

Requirements:
- Each question should be clear and unambiguous
- Provide exactly 4 answer options for each question
- Only one option should be correct
- Options should be plausible but clearly distinguishable
- Questions should test understanding, not just memorization

Return ONLY a JSON object in this exact format, no other text:
{
  "questions": [
    {
      "question_text": "The question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": 0
    }
  ]
}

Where correct_answer is the index (0-3) of the correct option.`;

    console.log('Calling Lovable AI for topic:', topic, 'difficulty:', difficulty, 'count:', count);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service error: ' + response.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Lovable AI response received');
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in response');
    }

    // Parse the JSON from the response
    let generatedQuestions;
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        generatedQuestions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    console.log('Generated', generatedQuestions.questions?.length || 0, 'questions');

    return new Response(
      JSON.stringify({ questions: generatedQuestions.questions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-questions function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
