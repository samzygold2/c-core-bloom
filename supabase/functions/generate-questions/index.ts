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

    const systemPrompt = `You are an expert test question generator. Generate multiple-choice questions based on the given topic and difficulty level. Each question should have exactly 4 options with only one correct answer.`;

    const userPrompt = `Generate ${count} multiple-choice questions about "${topic}" with ${difficulty} difficulty level. 

Requirements:
- Each question should be clear and unambiguous
- Provide exactly 4 answer options for each question
- Only one option should be correct
- Options should be plausible but clearly distinguishable
- Questions should test understanding, not just memorization
- Format should be suitable for a test environment`;

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
        tools: [{
          type: 'function',
          function: {
            name: 'generate_questions',
            description: 'Generate test questions with multiple choice answers',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question_text: { type: 'string', description: 'The question text' },
                      options: {
                        type: 'array',
                        items: { type: 'string' },
                        minItems: 4,
                        maxItems: 4,
                        description: 'Exactly 4 answer options'
                      },
                      correct_answer: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 3,
                        description: 'Index of the correct answer (0-3)'
                      }
                    },
                    required: ['question_text', 'options', 'correct_answer'],
                    additionalProperties: false
                  }
                }
              },
              required: ['questions'],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_questions' } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI gateway error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error('No tool call in response');
    }

    const generatedQuestions = JSON.parse(toolCall.function.arguments);

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
