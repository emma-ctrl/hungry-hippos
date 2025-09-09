/**
 * Smart Orchestrator - Coordinates the multi-agent meal planning workflow
 * 
 * This orchestrator executes the workflow sequentially with intelligent
 * decision-making between each step:
 * 
 * 1. Dietary Analysis (with refinement if needed)
 * 2. Recipe Selection (with improvement if needed) 
 * 3. Quantity Calculations (deterministic)
 * 4. Budget Optimization (with plan revision if needed)
 * 
 * The orchestrator makes decisions based on confidence scores, complexity,
 * and business logic to ensure high-quality meal plans.
 */

import { 
  getMealPlan, 
  updateMealPlanStatus, 
  saveAgentDecision,
  getSelectedRecipes 
} from '../services/database.js'
import { analyzeDietary, callWithFunctions } from '../services/openai.js'
import { searchRecipes } from '../services/spoonacular.js'
import { 
  consolidateIngredients,
  analyzeDietaryComplexity 
} from '../services/calculations.js'

export interface WorkflowResult {
  success: boolean
  mealPlanId: string
  executionTime: number
  steps: WorkflowStep[]
  finalPlan?: any
  error?: string
}

export interface WorkflowStep {
  stepName: string
  agentType: 'dietary' | 'meal_planner' | 'budget' | 'orchestrator'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  result?: any
  reasoning?: string
  confidenceScore?: number
  executionTime?: number
  retryCount?: number
}

export interface DietaryAnalysisResult {
  overall_complexity: 'simple' | 'moderate' | 'complex' | 'very_complex'
  primary_constraints: string[]
  cross_contamination_risks: string[]
  special_accommodations: string[]
  reasoning: string
  confidence_score: number
}

export interface RecipeSelectionResult {
  selectedRecipes: any[]
  varietyScore: number
  avgConfidence: number
  totalRecipesSelected: number
}

export class SmartOrchestrator {
  private progressCallback?: (step: WorkflowStep) => void

  constructor(progressCallback?: (step: WorkflowStep) => void | undefined) {
    if (progressCallback) {
      this.progressCallback = progressCallback
    }
  }

  /**
   * Execute the complete meal planning workflow
   */
  async executeWorkflow(mealPlanId: string): Promise<WorkflowResult> {
    const startTime = Date.now()
    const steps: WorkflowStep[] = []

    try {
      console.log(`🎯 Starting Smart Orchestrator workflow for meal plan: ${mealPlanId}`)

      // Update meal plan status
      await updateMealPlanStatus(mealPlanId, 'processing')

      // Get meal plan details
      const mealPlan = await getMealPlan(mealPlanId)
      if (!mealPlan) {
        throw new Error(`Meal plan ${mealPlanId} not found`)
      }

      console.log(`📊 Meal plan details: ${mealPlan.attendeeCount} attendees, ${mealPlan.attendees.length} attendee records`)

      // STEP 1: Dietary Analysis with intelligent refinement
      const dietaryResult = await this.executeDietaryAnalysis(mealPlanId, steps)
      
      // STEP 2: Recipe Selection with variety checking
      await this.executeRecipeSelection(mealPlanId, dietaryResult, mealPlan, steps)
      
      // STEP 3: Quantity Calculations (deterministic step)
      await this.executeQuantityCalculations(mealPlanId, steps)
      
      // STEP 4: Budget Optimization with budget compliance checking
      await this.executeBudgetOptimization(mealPlanId, steps)

      // Update final status
      await updateMealPlanStatus(mealPlanId, 'completed')

      const executionTime = Date.now() - startTime
      console.log(`✅ Workflow completed successfully in ${executionTime}ms`)

      return {
        success: true,
        mealPlanId,
        executionTime,
        steps,
        finalPlan: await getMealPlan(mealPlanId)
      }

    } catch (error: any) {
      console.error(`❌ Workflow failed for meal plan ${mealPlanId}:`, error.message)
      
      await updateMealPlanStatus(mealPlanId, 'failed')
      
      const executionTime = Date.now() - startTime
      return {
        success: false,
        mealPlanId,
        executionTime,
        steps,
        error: error.message
      }
    }
  }

  /**
   * Step 1: Dietary Analysis with intelligent refinement
   */
  private async executeDietaryAnalysis(mealPlanId: string, steps: WorkflowStep[]): Promise<DietaryAnalysisResult> {
    const step: WorkflowStep = {
      stepName: 'Dietary Analysis',
      agentType: 'dietary',
      status: 'in_progress'
    }
    steps.push(step)
    this.notifyProgress(step)

    const stepStartTime = Date.now()

    try {
      console.log(`🧠 Step 1: Executing dietary analysis for meal plan: ${mealPlanId}`)

      // Get meal plan with attendees
      const mealPlan = await getMealPlan(mealPlanId)
      if (!mealPlan?.attendees?.length) {
        throw new Error('No attendees found for dietary analysis')
      }

      // Prepare attendee data
      const attendeesData = mealPlan.attendees.map(attendee => ({
        name: attendee.name,
        dietaryRestrictions: attendee.dietaryRestrictions,
        foodPreferences: attendee.foodPreferences,
        specialNotes: attendee.specialNotes,
        dietarySeverity: attendee.dietarySeverity
      }))

      // Execute AI dietary analysis
      const aiResponse = await analyzeDietary(attendeesData)
      const aiAnalysis = aiResponse.functionCall?.arguments as DietaryAnalysisResult

      if (!aiAnalysis) {
        throw new Error('AI did not provide dietary analysis result')
      }

      // Also run local analysis for comparison
      const localAnalysis = analyzeDietaryComplexity(mealPlan.attendees)

      // Save decision to database
      await saveAgentDecision(
        mealPlanId,
        'dietary',
        'dietary_analysis',
        { aiAnalysis, localAnalysis },
        aiResponse.message,
        aiAnalysis.confidence_score
      )

      step.status = 'completed'
      step.result = aiAnalysis
      step.reasoning = aiAnalysis.reasoning
      step.confidenceScore = aiAnalysis.confidence_score
      step.executionTime = Date.now() - stepStartTime

      // ORCHESTRATOR DECISION: Should we refine the analysis?
      if (aiAnalysis.overall_complexity === 'very_complex' || aiAnalysis.confidence_score < 0.7) {
        console.log(`🤔 Orchestrator Decision: Low confidence (${aiAnalysis.confidence_score}) or very complex dietary requirements. Requesting refinement...`)
        
        // Add refinement step
        const refinedAnalysis = await this.refineDietaryAnalysis(mealPlanId, aiAnalysis, steps)
        return refinedAnalysis
      }

      this.notifyProgress(step)
      console.log(`✅ Dietary analysis completed with confidence: ${aiAnalysis.confidence_score}`)
      return aiAnalysis

    } catch (error: any) {
      step.status = 'failed'
      step.executionTime = Date.now() - stepStartTime
      this.notifyProgress(step)
      throw new Error(`Dietary analysis failed: ${error.message}`)
    }
  }

  /**
   * Refine dietary analysis for complex cases
   */
  private async refineDietaryAnalysis(mealPlanId: string, initialAnalysis: DietaryAnalysisResult, steps: WorkflowStep[]): Promise<DietaryAnalysisResult> {
    const step: WorkflowStep = {
      stepName: 'Dietary Analysis Refinement',
      agentType: 'dietary',
      status: 'in_progress'
    }
    steps.push(step)
    this.notifyProgress(step)

    const stepStartTime = Date.now()

    try {
      console.log(`🔍 Refining dietary analysis due to complexity or low confidence`)

      const mealPlan = await getMealPlan(mealPlanId)
      const attendeesData = mealPlan!.attendees.map(attendee => ({
        name: attendee.name,
        dietaryRestrictions: attendee.dietaryRestrictions,
        foodPreferences: attendee.foodPreferences,
        specialNotes: attendee.specialNotes,
        dietarySeverity: attendee.dietarySeverity
      }))

      // Enhanced prompt for refinement
      const systemPrompt = `You are a senior dietary specialist AI with deep expertise in complex dietary requirements. You are refining a previous dietary analysis that had low confidence or very high complexity.

Previous Analysis Issues:
- Complexity: ${initialAnalysis.overall_complexity}
- Confidence: ${initialAnalysis.confidence_score}
- Previous constraints: ${initialAnalysis.primary_constraints.join(', ')}

Your task is to provide a more detailed, nuanced analysis with higher confidence. Focus on:
- Precise categorization of restrictions by severity (medical, religious, preference)
- Detailed cross-contamination risk assessment
- Specific accommodation strategies for group cooking
- Clear prioritization of constraints`

      const userMessage = `Please provide a refined dietary analysis for this group:

ATTENDEES: ${JSON.stringify(attendeesData, null, 2)}

PREVIOUS ANALYSIS: ${JSON.stringify(initialAnalysis, null, 2)}

Focus on improving confidence and providing more actionable insights for group meal planning.`

      const functions = [{
        name: "refine_dietary_requirements",
        description: "Provide refined dietary analysis with higher confidence",
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
            constraint_priorities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  constraint: { type: "string" },
                  severity: { type: "string", enum: ["critical", "important", "preferred"] },
                  reasoning: { type: "string" }
                }
              }
            },
            reasoning: {
              type: "string",
              description: "Detailed refined analysis reasoning"
            },
            confidence_score: {
              type: "number",
              minimum: 0,
              maximum: 1
            }
          },
          required: ["overall_complexity", "primary_constraints", "reasoning", "confidence_score", "constraint_priorities"]
        }
      }]

      const refinedResponse = await callWithFunctions(systemPrompt, userMessage, functions)
      const refinedAnalysis = refinedResponse.functionCall?.arguments as DietaryAnalysisResult

      if (!refinedAnalysis) {
        throw new Error('Refinement did not provide analysis result')
      }

      // Save refinement decision
      await saveAgentDecision(
        mealPlanId,
        'dietary',
        'dietary_refinement',
        { refinedAnalysis, originalAnalysis: initialAnalysis },
        refinedResponse.message,
        refinedAnalysis.confidence_score
      )

      step.status = 'completed'
      step.result = refinedAnalysis
      step.reasoning = `Refined analysis improved confidence from ${initialAnalysis.confidence_score} to ${refinedAnalysis.confidence_score}`
      step.confidenceScore = refinedAnalysis.confidence_score
      step.executionTime = Date.now() - stepStartTime

      this.notifyProgress(step)
      console.log(`✅ Dietary analysis refined with improved confidence: ${refinedAnalysis.confidence_score}`)
      return refinedAnalysis

    } catch (error: any) {
      step.status = 'failed'
      step.executionTime = Date.now() - stepStartTime
      this.notifyProgress(step)
      // Fall back to original analysis if refinement fails
      console.warn(`⚠️ Refinement failed, using original analysis: ${error.message}`)
      return initialAnalysis
    }
  }

  /**
   * Step 2: Recipe Selection with variety checking
   */
  private async executeRecipeSelection(
    mealPlanId: string, 
    dietaryResult: DietaryAnalysisResult, 
    mealPlan: any, 
    steps: WorkflowStep[]
  ): Promise<RecipeSelectionResult> {
    const step: WorkflowStep = {
      stepName: 'Recipe Selection',
      agentType: 'meal_planner',
      status: 'in_progress'
    }
    steps.push(step)
    this.notifyProgress(step)

    const stepStartTime = Date.now()

    try {
      console.log(`👨‍🍳 Step 2: Executing recipe selection for meal plan: ${mealPlanId}`)

      // Calculate number of days and meals needed
      const startDate = new Date(mealPlan.startDate)
      const endDate = new Date(mealPlan.endDate)
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
      
      console.log(`📅 Planning for ${daysDiff} days`)

      const selectedRecipes = []
      const mealTypes = ['breakfast', 'lunch', 'dinner']

      // Generate meal slots (breakfast_day1, lunch_day1, etc.)
      for (let day = 1; day <= daysDiff; day++) {
        for (const mealType of mealTypes) {
          const mealSlot = `${mealType}_day${day}`
          console.log(`🔍 Selecting recipe for ${mealSlot}`)

          // Search for recipes based on dietary constraints
          const searchOptions: any = {
            number: 20,
            maxReadyTime: mealType === 'breakfast' ? 30 : 60
          }
          
          // Only add type if it's a valid Spoonacular type
          const mappedType = this.mapMealType(mealType)
          if (mappedType) {
            searchOptions.type = mappedType as any
          }
          
          const dietType = this.extractDietType(dietaryResult.primary_constraints)
          if (dietType) {
            searchOptions.diet = dietType
          }
          
          const intolerances = this.extractIntolerances(dietaryResult.primary_constraints)
          if (intolerances.length > 0) {
            searchOptions.intolerances = intolerances
          }

          const searchResults = await searchRecipes(searchOptions)

          if (!searchResults.results || searchResults.results.length === 0) {
            console.warn(`⚠️ No recipes found for ${mealSlot}, using fallback search`)
            // Fallback search with broader criteria
            const fallbackResults = await searchRecipes({ type: mappedType as any, number: 10 })
            searchResults.results = fallbackResults.results
          }

          // Use AI to select the best recipe
          const selection = await this.selectRecipeWithAI(mealPlanId, mealSlot, searchResults.results, dietaryResult, mealPlan.attendeeCount)
          selectedRecipes.push(selection)

          // Small delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      // Calculate variety and confidence metrics
      const varietyScore = this.calculateVarietyScore(selectedRecipes)
      const avgConfidence = selectedRecipes.reduce((sum, recipe) => sum + (recipe.confidence_score || 0), 0) / selectedRecipes.length

      const recipeResult: RecipeSelectionResult = {
        selectedRecipes,
        varietyScore,
        avgConfidence,
        totalRecipesSelected: selectedRecipes.length
      }

      step.status = 'completed'
      step.result = recipeResult
      step.reasoning = `Selected ${selectedRecipes.length} recipes with variety score ${varietyScore.toFixed(2)} and average confidence ${avgConfidence.toFixed(2)}`
      step.confidenceScore = avgConfidence
      step.executionTime = Date.now() - stepStartTime

      // ORCHESTRATOR DECISION: Is recipe selection quality sufficient?
      if (varietyScore < 0.6 || avgConfidence < 0.7) {
        console.log(`🤔 Orchestrator Decision: Low variety (${varietyScore}) or confidence (${avgConfidence}). Attempting improvement...`)
        // For now, we'll proceed but log the issue - improvement logic could be added here
        console.warn(`⚠️ Recipe selection quality could be improved but proceeding with current selection`)
      }

      this.notifyProgress(step)
      console.log(`✅ Recipe selection completed: ${selectedRecipes.length} recipes selected`)
      return recipeResult

    } catch (error: any) {
      step.status = 'failed'
      step.executionTime = Date.now() - stepStartTime
      this.notifyProgress(step)
      throw new Error(`Recipe selection failed: ${error.message}`)
    }
  }

  /**
   * Step 3: Quantity Calculations (deterministic)
   */
  private async executeQuantityCalculations(
    mealPlanId: string, 
    steps: WorkflowStep[]
  ): Promise<any> {
    const step: WorkflowStep = {
      stepName: 'Quantity Calculations',
      agentType: 'orchestrator',
      status: 'in_progress'
    }
    steps.push(step)
    this.notifyProgress(step)

    const stepStartTime = Date.now()

    try {
      console.log(`🧮 Step 3: Calculating quantities and consolidating ingredients`)

      // This is a deterministic step - no AI involved
      const recipes = await getSelectedRecipes(mealPlanId)
      
      if (!recipes || recipes.length === 0) {
        throw new Error('No recipes found for quantity calculations')
      }

      // Extract ingredients from all recipes
      const recipeIngredients: Record<string, any[]> = {}
      recipes.forEach(recipe => {
        recipeIngredients[recipe.recipeName] = recipe.scaledIngredients as any[]
      })

      // Consolidate ingredients across all recipes
      const consolidatedIngredients = consolidateIngredients(recipeIngredients)

      step.status = 'completed'
      step.result = { consolidatedIngredients, totalRecipes: recipes.length }
      step.reasoning = `Consolidated ${consolidatedIngredients.length} unique ingredients from ${recipes.length} recipes`
      step.executionTime = Date.now() - stepStartTime

      this.notifyProgress(step)
      console.log(`✅ Quantity calculations completed: ${consolidatedIngredients.length} ingredients consolidated`)
      return { consolidatedIngredients, recipes }

    } catch (error: any) {
      step.status = 'failed'
      step.executionTime = Date.now() - stepStartTime
      this.notifyProgress(step)
      throw new Error(`Quantity calculations failed: ${error.message}`)
    }
  }

  /**
   * Step 4: Budget Optimization with compliance checking
   */
  private async executeBudgetOptimization(mealPlanId: string, steps: WorkflowStep[]): Promise<any> {
    const step: WorkflowStep = {
      stepName: 'Budget Optimization',
      agentType: 'budget',
      status: 'in_progress'
    }
    steps.push(step)
    this.notifyProgress(step)

    const stepStartTime = Date.now()

    try {
      console.log(`💰 Step 4: Executing budget optimization`)

      // Import required functions for direct budget optimization
      const { 
        consolidateIngredients,
        calculateTotalCost,
        organizeShoppingList 
      } = await import('../services/calculations.js')
      const { 
        saveShoppingItems,
        saveBudgetAnalysis 
      } = await import('../services/database.js')
      const { callWithFunctions } = await import('../services/openai.js')

      // Get meal plan with selected recipes
      const mealPlanForBudget = await getMealPlan(mealPlanId)
      if (!mealPlanForBudget) {
        throw new Error('Meal plan not found')
      }

      if (!mealPlanForBudget.recipes || mealPlanForBudget.recipes.length === 0) {
        throw new Error('No recipes selected. Select recipes before budget optimization.')
      }

      // Extract ingredients from all selected recipes
      const recipeIngredients: Record<string, any[]> = {}
      mealPlanForBudget.recipes.forEach(recipe => {
        recipeIngredients[recipe.recipeName] = recipe.scaledIngredients as any[]
      })

      // Consolidate ingredients across all recipes
      const consolidatedIngredients = consolidateIngredients(recipeIngredients)

      // Calculate costs
      const costAnalysis = calculateTotalCost(consolidatedIngredients)

      // Organize shopping list by store sections
      const organizedShoppingList = organizeShoppingList(consolidatedIngredients)

      // Call AI for budget optimization advice
      const systemPrompt = `You are a financial optimization specialist AI focused on food budgeting and cost optimization for group meal planning.

Your responsibilities:
- Analyze total costs and budget compliance
- Identify cost-saving opportunities without compromising quality
- Organize shopping lists for maximum efficiency
- Suggest budget reallocation for optimal value
- Provide cost-benefit analysis for ingredient choices

Consider:
- Quality vs cost trade-offs for different food categories
- Bulk buying opportunities and storage considerations
- Seasonal pricing and ingredient availability
- Store organization for efficient shopping
- Contingency planning within budget constraints

Focus on practical, implementable cost optimizations while maintaining meal quality and dietary compliance.`

      const userMessage = `Please optimize the budget and shopping list for this meal plan:

BUDGET INFO:
- Target Budget: $${mealPlanForBudget.budgetTotal || 'No budget set'}
- Estimated Total Cost: $${costAnalysis.totalCost}
- Budget Status: ${mealPlanForBudget.budgetTotal ? (costAnalysis.totalCost > mealPlanForBudget.budgetTotal ? 'Over budget' : 'Within budget') : 'No budget constraint'}

COST BREAKDOWN:
${JSON.stringify(costAnalysis.itemizedCosts.slice(0, 20), null, 2)}

ORGANIZED SHOPPING LIST:
${JSON.stringify(organizedShoppingList, null, 2)}

Please provide budget optimization suggestions and prioritize the shopping list.`

      const functions = [{
        name: "optimize_budget_and_shopping",
        description: "Optimize shopping list and budget allocation",
        parameters: {
          type: "object",
          properties: {
            total_estimated_cost: { type: "number" },
            budget_status: { type: "string", enum: ["within_budget", "over_budget", "no_budget_set"] },
            cost_saving_opportunities: {
              type: "array",
              items: { type: "string" }
            },
            priority_shopping_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  priority: { type: "number", minimum: 1, maximum: 5 },
                  reasoning: { type: "string" }
                }
              }
            },
            optimization_reasoning: { type: "string" },
            confidence_score: { type: "number", minimum: 0, maximum: 1 }
          },
          required: ["total_estimated_cost", "budget_status", "cost_saving_opportunities", "optimization_reasoning", "confidence_score"]
        }
      }]

      // Call AI for optimization
      const aiResponse = await callWithFunctions(systemPrompt, userMessage, functions)
      const optimization = aiResponse.functionCall?.arguments || {}

      // Prepare shopping items for database
      const shoppingItems = consolidatedIngredients.map((ingredient) => ({
        ingredientName: ingredient.name,
        quantity: ingredient.totalAmount,
        unit: ingredient.unit,
        estimatedCost: costAnalysis.itemizedCosts.find(item => item.name === ingredient.name)?.estimatedCost || 0,
        storeSection: ingredient.aisle,
        optimizationReasoning: optimization.optimization_reasoning || 'Budget optimization analysis',
        priority: optimization.priority_shopping_items?.find((item: any) => 
          item.item.toLowerCase().includes(ingredient.name.toLowerCase())
        )?.priority || 3
      }))

      // Save to database
      await saveShoppingItems(mealPlanId, shoppingItems)
      
      await saveBudgetAnalysis(
        mealPlanId,
        costAnalysis.totalCost,
        { itemizedCosts: costAnalysis.itemizedCosts, organizedBySection: organizedShoppingList },
        optimization.cost_saving_opportunities?.join('; ') || 'No specific optimizations identified',
        optimization.optimization_reasoning || 'Budget analysis completed'
      )

      const budgetResult = {
        budgetAnalysis: {
          totalCost: costAnalysis.totalCost,
          targetBudget: mealPlanForBudget.budgetTotal,
          withinBudget: mealPlanForBudget.budgetTotal ? costAnalysis.totalCost <= mealPlanForBudget.budgetTotal : null,
          consolidatedIngredients,
          organizedShoppingList,
          aiOptimization: optimization
        },
        usage: aiResponse.usage
      }

      step.status = 'completed'
      step.result = budgetResult.budgetAnalysis
      step.reasoning = budgetResult.budgetAnalysis.aiOptimization?.optimization_reasoning || 'Budget optimization completed'
      step.confidenceScore = budgetResult.budgetAnalysis.aiOptimization?.confidence_score
      step.executionTime = Date.now() - stepStartTime

      // ORCHESTRATOR DECISION: Check budget compliance
      if (mealPlanForBudget?.budgetTotal) {
        const budgetOverage = (budgetResult.budgetAnalysis.totalCost - mealPlanForBudget.budgetTotal) / mealPlanForBudget.budgetTotal
        
        if (budgetOverage > 0.15) { // More than 15% over budget
          console.log(`🤔 Orchestrator Decision: Significant budget overrun (${(budgetOverage * 100).toFixed(1)}%). Budget revision needed.`)
          // For now, we'll log this but could implement revision logic
          await saveAgentDecision(
            mealPlanId,
            'orchestrator',
            'budget_overrun_detected',
            { budgetOverage, totalCost: budgetResult.budgetAnalysis.totalCost, targetBudget: mealPlanForBudget.budgetTotal },
            `Budget overrun detected: ${(budgetOverage * 100).toFixed(1)}% over target`,
            0.8
          )
        }
      }

      this.notifyProgress(step)
      console.log(`✅ Budget optimization completed`)
      return budgetResult

    } catch (error: any) {
      step.status = 'failed'
      step.executionTime = Date.now() - stepStartTime
      this.notifyProgress(step)
      throw new Error(`Budget optimization failed: ${error.message}`)
    }
  }

  // Helper Methods

  private async selectRecipeWithAI(
    mealPlanId: string,
    mealSlot: string,
    searchResults: any[],
    dietaryConstraints: DietaryAnalysisResult,
    attendeeCount: number
  ) {
    if (!searchResults || searchResults.length === 0) {
      throw new Error(`No recipes available for ${mealSlot}`)
    }

    // Import required functions
    const { callWithFunctions } = await import('../services/openai.js')
    const { getRecipeDetails } = await import('../services/spoonacular.js')
    const { scaleRecipeIngredients } = await import('../services/calculations.js')
    const { saveSelectedRecipe } = await import('../services/database.js')

    // Prepare AI prompt for recipe selection
    const systemPrompt = `You are a chef AI specializing in group meal planning for ${attendeeCount} people.

Select the best recipe that:
- Complies with ALL dietary restrictions
- Scales well for group cooking
- Uses accessible ingredients
- Provides clear reasoning for selection

Prioritize strict dietary compliance over preferences.`

    // Reduce data size for OpenAI by only including essential recipe info
    const simplifiedRecipes = searchResults.slice(0, 5).map(recipe => ({
      id: recipe.id,
      title: recipe.title,
      readyInMinutes: recipe.readyInMinutes,
      servings: recipe.servings,
      diets: recipe.diets || [],
      dishTypes: recipe.dishTypes || [],
      summary: recipe.summary ? recipe.summary.substring(0, 200) + '...' : 'No summary available'
    }))

    const userMessage = `Please select the best recipe for ${mealSlot} from these options:

MEAL PLAN INFO:
- Attendee Count: ${attendeeCount}

DIETARY CONSTRAINTS SUMMARY:
- Complexity: ${dietaryConstraints.overall_complexity}
- Key Restrictions: ${dietaryConstraints.primary_constraints.join(', ')}
- Cross-contamination Risks: ${dietaryConstraints.cross_contamination_risks.join(', ')}

AVAILABLE RECIPES (top 5):
${JSON.stringify(simplifiedRecipes, null, 2)}

Please select the most appropriate recipe and provide reasoning.`

    // Estimate token count (rough approximation: 1 token ≈ 4 characters)
    const estimatedTokens = (systemPrompt.length + userMessage.length) / 4
    console.log(`📏 Estimated tokens for recipe selection: ${Math.round(estimatedTokens)}`)

    // Define function for AI to use
    const functions = [{
      name: "select_recipe",
      description: "Select the best recipe for the meal slot",
      parameters: {
        type: "object",
        properties: {
          selected_recipe_id: {
            type: "number",
            description: "Spoonacular recipe ID of selected recipe"
          },
          recipe_name: {
            type: "string",
            description: "Name of selected recipe"
          },
          selection_reasoning: {
            type: "string",
            description: "Detailed reasoning for recipe selection"
          },
          estimated_servings: {
            type: "number",
            description: "Estimated servings needed for the group size"
          },
          confidence_score: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence in the selection (0-1)"
          }
        },
        required: ["selected_recipe_id", "recipe_name", "selection_reasoning", "estimated_servings", "confidence_score"]
      }
    }]

    // Call OpenAI for recipe selection with GPT-4o-mini (larger context window)
    const aiResponse = await callWithFunctions(
      systemPrompt, 
      userMessage, 
      functions, 
      'gpt-4o-mini',  // More cost-effective with larger context window
      { temperature: 0.3, maxTokens: 1000 }
    )

    if (!aiResponse.functionCall) {
      throw new Error('AI did not provide a recipe selection')
    }

    const selection = aiResponse.functionCall.arguments

    // Find the selected recipe details
    const selectedRecipe = searchResults.find((recipe: any) => recipe.id === selection.selected_recipe_id)
    if (!selectedRecipe) {
      throw new Error('Selected recipe not found in search results')
    }

    // Get detailed recipe information if needed
    let detailedRecipe = selectedRecipe
    if (!selectedRecipe.extendedIngredients) {
      detailedRecipe = await getRecipeDetails(selection.selected_recipe_id)
    }

    // Scale ingredients for group size
    const scaledIngredients = scaleRecipeIngredients(detailedRecipe, selection.estimated_servings)

    // Save selection to database
    await saveSelectedRecipe(
      mealPlanId,
      mealSlot,
      selection.selected_recipe_id,
      selection.recipe_name,
      selection.selection_reasoning,
      selection.estimated_servings,
      scaledIngredients,
      selection.confidence_score
    )

    console.log(`✅ Selected recipe: ${selection.recipe_name} for ${mealSlot}`)

    return {
      ...selection,
      recipeDetails: detailedRecipe,
      scaledIngredients
    }
  }

  private extractDietType(constraints: string[]): string | undefined {
    const constraintStr = constraints.join(' ').toLowerCase()
    
    if (constraintStr.includes('vegan')) return 'vegan'
    if (constraintStr.includes('vegetarian')) return 'vegetarian'
    if (constraintStr.includes('ketogenic') || constraintStr.includes('keto')) return 'ketogenic'
    if (constraintStr.includes('paleo')) return 'paleo'
    if (constraintStr.includes('whole30')) return 'whole30'
    
    return undefined
  }

  private extractIntolerances(constraints: string[]): string[] {
    const intolerances = []
    const constraintStr = constraints.join(' ').toLowerCase()
    
    if (constraintStr.includes('dairy') || constraintStr.includes('lactose')) intolerances.push('dairy')
    if (constraintStr.includes('gluten')) intolerances.push('gluten')
    if (constraintStr.includes('egg')) intolerances.push('egg')
    if (constraintStr.includes('nut') || constraintStr.includes('peanut')) intolerances.push('peanut')
    if (constraintStr.includes('seafood') || constraintStr.includes('shellfish')) intolerances.push('seafood')
    if (constraintStr.includes('soy')) intolerances.push('soy')
    if (constraintStr.includes('sesame')) intolerances.push('sesame')
    if (constraintStr.includes('sulfite')) intolerances.push('sulfite')
    
    return intolerances
  }

  private calculateVarietyScore(recipes: any[]): number {
    if (recipes.length === 0) return 0
    
    // Simple variety calculation based on unique recipe names and cuisines
    const uniqueNames = new Set(recipes.map(r => r.recipe_name))
    const nameVariety = uniqueNames.size / recipes.length
    
    // Could add more sophisticated variety metrics here
    return Math.min(nameVariety, 1.0)
  }

  private notifyProgress(step: WorkflowStep) {
    this.progressCallback?.(step)
  }

  private mapMealType(mealType: string): string {
    // Map our meal types to Spoonacular's expected types
    const typeMap: Record<string, string> = {
      'breakfast': 'breakfast',
      'lunch': 'main course',
      'dinner': 'main course'
    }
    return typeMap[mealType] || 'main course'
  }
}

// Export singleton instance
export const smartOrchestrator = new SmartOrchestrator()

export default SmartOrchestrator