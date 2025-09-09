/**
 * OpenAI Service - All AI interactions with function calling
 * 
 * This service handles all communication with OpenAI's API, including
 * function calling for our AI agents
 */

import OpenAI from 'openai'

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface FunctionDefinition {
  name: string
  description: string
  parameters: any
}

export interface AIResponse {
  message: string
  functionCall?: {
    name: string
    arguments: any
  }
  usage?: any
}

export const callWithFunctions = async (
  systemPrompt: string,
  userMessage: string,
  functions: FunctionDefinition[] = [],
  model: string = 'gpt-4',
  options: {
    temperature?: number
    maxTokens?: number
    retries?: number
  } = {}
): Promise<AIResponse> => {
  const { temperature = 0.7, maxTokens = 2000, retries = 2 } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`🤖 OpenAI ${model} call (attempt ${attempt + 1}/${retries + 1})`)
      console.log(`📝 Message length: ${userMessage.length} chars`)
      console.log(`🔧 Functions available: ${functions.length}`)

      const requestParams: any = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
        max_tokens: maxTokens,
      }

      // Add function calling if functions provided
      if (functions.length > 0) {
        requestParams.tools = functions.map(fn => ({
          type: 'function',
          function: fn
        }))
        requestParams.tool_choice = 'auto'
      }

      const completion = await openai.chat.completions.create(requestParams)

      const message = completion.choices[0]?.message
      const usage = completion.usage

      console.log(`💰 Tokens used: ${usage?.total_tokens || 0} (prompt: ${usage?.prompt_tokens}, completion: ${usage?.completion_tokens})`)

      if (!message) {
        throw new Error('No message returned from OpenAI')
      }

      const response: AIResponse = {
        message: message.content || '',
        usage
      }

      // Handle function calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls[0]
        if (toolCall && toolCall.type === 'function' && 'function' in toolCall) {
          try {
            const args = JSON.parse(toolCall.function.arguments)
            response.functionCall = {
              name: toolCall.function.name,
              arguments: args
            }
            console.log(`🔧 Function called: ${toolCall.function.name}`)
          } catch (parseError) {
            console.error('❌ Failed to parse function arguments:', parseError)
            console.error('Raw arguments:', toolCall.function.arguments)
          }
        }
      }

      return response

    } catch (error: any) {
      console.error(`❌ OpenAI API call failed (attempt ${attempt + 1}):`, error.message)
      
      if (attempt === retries) {
        throw new Error(`OpenAI API failed after ${retries + 1} attempts: ${error.message}`)
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
    }
  }

  throw new Error('Unexpected end of retry loop')
}

/**
 * Specialized function for dietary analysis
 */
export const analyzeDietary = async (attendeesData: any[]): Promise<AIResponse> => {
  const systemPrompt = `You are a professional dietary specialist AI focused on analyzing dietary requirements for group meal planning.

Your responsibilities:
- Analyze attendee dietary restrictions with nuanced understanding
- Assess severity levels (medical allergies vs preferences vs religious requirements)  
- Identify potential cross-contamination risks in group cooking
- Consider cultural and religious dietary sensitivities
- Provide clear reasoning for all dietary decisions

Always consider:
- Medical allergies require strict compliance
- Religious restrictions need cultural sensitivity
- Preferences can be accommodated when possible
- Cross-contamination risks in shared cooking spaces

Respond using the provided function format with detailed reasoning.`

  const userMessage = `Please analyze the dietary requirements for this group meal planning:

Attendees: ${JSON.stringify(attendeesData, null, 2)}

Please provide a comprehensive dietary analysis including complexity assessment, constraints, risks, and recommendations.`

  const functions: FunctionDefinition[] = [{
    name: "analyze_dietary_requirements",
    description: "Analyze dietary complexity and requirements for meal planning",
    parameters: {
      type: "object",
      properties: {
        overall_complexity: {
          type: "string",
          enum: ["simple", "moderate", "complex", "very_complex"]
        },
        primary_constraints: {
          type: "array",
          items: { type: "string" }
        },
        cross_contamination_risks: {
          type: "array", 
          items: { type: "string" }
        },
        special_accommodations: {
          type: "array",
          items: { type: "string" }
        },
        reasoning: {
          type: "string",
          description: "Detailed analysis reasoning"
        },
        confidence_score: {
          type: "number",
          minimum: 0,
          maximum: 1
        }
      },
      required: ["overall_complexity", "primary_constraints", "reasoning", "confidence_score"]
    }
  }]

  return callWithFunctions(systemPrompt, userMessage, functions)
}