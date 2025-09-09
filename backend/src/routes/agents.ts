/**
 * Agent Routes - Handle AI agent operations
 * 
 * This file defines REST API endpoints for:
 * - Dietary analysis using OpenAI
 * - Recipe search using Spoonacular
 * - Recipe selection and planning
 * - Budget optimization and shopping list generation
 */

import { Router } from 'express'
import { 
  analyzeDietary, 
  callWithFunctions 
} from '../services/openai.js'
import { 
  searchRecipes, 
  getRecipeDetails
} from '../services/spoonacular.js'
import { 
  scaleRecipeIngredients,
  consolidateIngredients,
  analyzeDietaryComplexity,
  calculateTotalCost,
  organizeShoppingList 
} from '../services/calculations.js'
import { 
  getMealPlan, 
  saveAgentDecision,
  saveSelectedRecipe,
  saveShoppingItems,
  saveBudgetAnalysis 
} from '../services/database.js'
import { SmartOrchestrator } from '../agents/Orchestrator.js'

const router = Router()

/**
 * POST /api/agents/dietary/analyze
 * Analyze dietary requirements for a meal plan
 * 
 * Expected body:
 * {
 *   mealPlanId: string
 * }
 */
router.post('/dietary/analyze', async (req, res) => {
  try {
    const { mealPlanId } = req.body

    console.log(`🧠 Starting dietary analysis for meal plan: ${mealPlanId}`)

    // Validate input
    if (!mealPlanId || typeof mealPlanId !== 'string') {
      return res.status(400).json({ error: 'mealPlanId is required' })
    }

    // Get meal plan with attendees
    const mealPlan = await getMealPlan(mealPlanId)
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    if (!mealPlan.attendees || mealPlan.attendees.length === 0) {
      return res.status(400).json({ error: 'No attendees found. Add attendees before dietary analysis.' })
    }

    // Prepare attendee data for AI analysis
    const attendeesData = mealPlan.attendees.map(attendee => ({
      name: attendee.name,
      dietaryRestrictions: attendee.dietaryRestrictions,
      foodPreferences: attendee.foodPreferences,
      specialNotes: attendee.specialNotes,
      dietarySeverity: attendee.dietarySeverity
    }))

    // Call dietary analysis AI
    const aiResponse = await analyzeDietary(attendeesData)

    // Also run our local calculations for comparison
    const localAnalysis = analyzeDietaryComplexity(mealPlan.attendees)

    // Combine AI insights with local calculations
    const analysisResult = {
      aiAnalysis: aiResponse.functionCall?.arguments || {},
      localAnalysis,
      aiReasoning: aiResponse.message,
      timestamp: new Date()
    }

    // Save the decision to database
    await saveAgentDecision(
      mealPlanId,
      'dietary',
      'dietary_analysis',
      analysisResult,
      aiResponse.message,
      aiResponse.functionCall?.arguments?.confidence_score
    )

    console.log(`✅ Dietary analysis completed for meal plan: ${mealPlanId}`)

    res.json({
      success: true,
      analysis: analysisResult,
      usage: aiResponse.usage
    })

  } catch (error: any) {
    console.error('❌ Error in dietary analysis:', error.message)
    res.status(500).json({
      error: 'Failed to analyze dietary requirements',
      details: error.message
    })
  }
})

/**
 * POST /api/agents/meal-planner/search
 * Search for recipes using Spoonacular API
 * 
 * Expected body:
 * {
 *   query?: string,
 *   diet?: string,
 *   intolerances?: string[],
 *   type?: string,
 *   maxReadyTime?: number,
 *   number?: number
 * }
 */
router.post('/meal-planner/search', async (req, res) => {
  try {
    const searchOptions = req.body

    console.log(`🔍 Searching recipes with options:`, searchOptions)

    // Validate number parameter
    if (searchOptions.number && (searchOptions.number < 1 || searchOptions.number > 100)) {
      return res.status(400).json({ error: 'Number must be between 1 and 100' })
    }

    // Search recipes using Spoonacular
    const searchResults = await searchRecipes(searchOptions)

    console.log(`✅ Found ${searchResults.totalResults} recipes, returning ${searchResults.results.length}`)

    res.json({
      success: true,
      results: searchResults.results,
      totalResults: searchResults.totalResults,
      searchOptions
    })

  } catch (error: any) {
    console.error('❌ Error searching recipes:', error.message)
    res.status(500).json({
      error: 'Failed to search recipes',
      details: error.message
    })
  }
})

/**
 * POST /api/agents/meal-planner/select
 * Use AI to select appropriate recipes for meal plan
 * 
 * Expected body:
 * {
 *   mealPlanId: string,
 *   searchResults: Recipe[],
 *   dietaryConstraints: any,
 *   mealSlot: string (e.g., "breakfast_day1")
 * }
 */
router.post('/meal-planner/select', async (req, res) => {
  try {
    const { mealPlanId, searchResults, dietaryConstraints, mealSlot } = req.body

    console.log(`👨‍🍳 AI selecting recipe for ${mealSlot} in meal plan: ${mealPlanId}`)

    // Validate inputs
    if (!mealPlanId || !searchResults || !mealSlot) {
      return res.status(400).json({ 
        error: 'mealPlanId, searchResults, and mealSlot are required' 
      })
    }

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      return res.status(400).json({ error: 'searchResults must be a non-empty array' })
    }

    // Get meal plan details
    const mealPlan = await getMealPlan(mealPlanId)
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    // Prepare AI prompt for recipe selection
    const systemPrompt = `You are a professional chef AI specializing in large group meal planning. You have extensive knowledge of recipes, cooking techniques, and practical considerations for feeding groups.

Your responsibilities:
- Select the best recipe from the provided options for the specified meal slot
- Ensure dietary compliance with the given constraints
- Consider cooking practicality for group sizes (${mealPlan.attendeeCount} people)
- Balance nutrition, variety, and cooking logistics
- Provide clear reasoning for your selection

Focus on:
- Recipes that scale well and use accessible ingredients
- Dietary restriction compliance
- Practical cooking considerations for group settings
- Cultural food variety and appeal`

    const userMessage = `Please select the best recipe for ${mealSlot} from these options:

MEAL PLAN INFO:
- Attendee Count: ${mealPlan.attendeeCount}
- Date Range: ${mealPlan.startDate} to ${mealPlan.endDate}

DIETARY CONSTRAINTS:
${JSON.stringify(dietaryConstraints, null, 2)}

AVAILABLE RECIPES:
${JSON.stringify(searchResults.slice(0, 10), null, 2)}

Please select the most appropriate recipe and provide reasoning.`

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

    // Call OpenAI for recipe selection
    const aiResponse = await callWithFunctions(systemPrompt, userMessage, functions)

    if (!aiResponse.functionCall) {
      return res.status(500).json({ error: 'AI did not provide a recipe selection' })
    }

    const selection = aiResponse.functionCall.arguments

    // Find the selected recipe details
    const selectedRecipe = searchResults.find((recipe: any) => recipe.id === selection.selected_recipe_id)
    if (!selectedRecipe) {
      return res.status(400).json({ error: 'Selected recipe not found in search results' })
    }

    // Get detailed recipe information if needed
    let detailedRecipe = selectedRecipe
    if (!selectedRecipe.extendedIngredients) {
      const details = await getRecipeDetails(selection.selected_recipe_id)
      detailedRecipe = details
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

    res.json({
      success: true,
      selection: {
        ...selection,
        recipeDetails: detailedRecipe,
        scaledIngredients
      },
      usage: aiResponse.usage
    })

  } catch (error: any) {
    console.error('❌ Error selecting recipe:', error.message)
    res.status(500).json({
      error: 'Failed to select recipe',
      details: error.message
    })
  }
})

/**
 * POST /api/agents/budget/optimize
 * Optimize budget and create organized shopping list
 * 
 * Expected body:
 * {
 *   mealPlanId: string
 * }
 */
router.post('/budget/optimize', async (req, res) => {
  try {
    const { mealPlanId } = req.body

    console.log(`💰 Starting budget optimization for meal plan: ${mealPlanId}`)

    // Validate input
    if (!mealPlanId || typeof mealPlanId !== 'string') {
      return res.status(400).json({ error: 'mealPlanId is required' })
    }

    // Get meal plan with selected recipes
    const mealPlan = await getMealPlan(mealPlanId)
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    if (!mealPlan.recipes || mealPlan.recipes.length === 0) {
      return res.status(400).json({ error: 'No recipes selected. Select recipes before budget optimization.' })
    }

    // Extract ingredients from all selected recipes
    const recipeIngredients: Record<string, any[]> = {}
    mealPlan.recipes.forEach(recipe => {
      recipeIngredients[recipe.recipeName] = recipe.scaledIngredients as any[]
    })

    // Consolidate ingredients across all recipes
    const consolidatedIngredients = consolidateIngredients(recipeIngredients)

    // Calculate costs
    const costAnalysis = calculateTotalCost(consolidatedIngredients)

    // Organize shopping list by store sections
    const organizedShoppingList = organizeShoppingList(consolidatedIngredients)

    // Prepare data for AI budget optimization
    const budgetData = {
      targetBudget: mealPlan.budgetTotal,
      totalCost: costAnalysis.totalCost,
      consolidatedIngredients,
      organizedShoppingList,
      itemizedCosts: costAnalysis.itemizedCosts
    }

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
- Target Budget: $${mealPlan.budgetTotal || 'No budget set'}
- Estimated Total Cost: $${costAnalysis.totalCost}
- Budget Status: ${mealPlan.budgetTotal ? (costAnalysis.totalCost > mealPlan.budgetTotal ? 'Over budget' : 'Within budget') : 'No budget constraint'}

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
    const shoppingItems = consolidatedIngredients.map((ingredient, index) => ({
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

    console.log(`✅ Budget optimization completed for meal plan: ${mealPlanId}`)

    res.json({
      success: true,
      budgetAnalysis: {
        totalCost: costAnalysis.totalCost,
        targetBudget: mealPlan.budgetTotal,
        withinBudget: mealPlan.budgetTotal ? costAnalysis.totalCost <= mealPlan.budgetTotal : null,
        consolidatedIngredients,
        organizedShoppingList,
        aiOptimization: optimization
      },
      usage: aiResponse.usage
    })

  } catch (error: any) {
    console.error('❌ Error optimizing budget:', error.message)
    res.status(500).json({
      error: 'Failed to optimize budget',
      details: error.message
    })
  }
})

/**
 * POST /api/agents/orchestrator/execute
 * Execute the complete meal planning workflow
 * 
 * Expected body:
 * {
 *   mealPlanId: string
 * }
 */
router.post('/orchestrator/execute', async (req, res) => {
  try {
    const { mealPlanId } = req.body

    console.log(`🎯 Starting Smart Orchestrator execution for meal plan: ${mealPlanId}`)

    // Validate input
    if (!mealPlanId || typeof mealPlanId !== 'string') {
      return res.status(400).json({ error: 'mealPlanId is required' })
    }

    // Check if meal plan exists
    const mealPlan = await getMealPlan(mealPlanId)
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    // Ensure we have attendees
    if (!mealPlan.attendees || mealPlan.attendees.length === 0) {
      return res.status(400).json({ 
        error: 'No attendees found. Add attendees before executing workflow.' 
      })
    }

    // Set up progress tracking
    const progressUpdates: any[] = []
    const orchestrator = new SmartOrchestrator((step) => {
      progressUpdates.push({
        ...step,
        timestamp: new Date()
      })
    })

    // Execute the complete workflow
    const result = await orchestrator.executeWorkflow(mealPlanId)

    console.log(`${result.success ? '✅' : '❌'} Orchestrator execution ${result.success ? 'completed' : 'failed'} for meal plan: ${mealPlanId}`)

    if (result.success) {
      res.json({
        success: true,
        workflowResult: result,
        progressUpdates,
        summary: {
          totalSteps: result.steps.length,
          executionTime: result.executionTime,
          completedSteps: result.steps.filter(s => s.status === 'completed').length,
          failedSteps: result.steps.filter(s => s.status === 'failed').length
        }
      })
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        workflowResult: result,
        progressUpdates,
        summary: {
          totalSteps: result.steps.length,
          executionTime: result.executionTime,
          completedSteps: result.steps.filter(s => s.status === 'completed').length,
          failedSteps: result.steps.filter(s => s.status === 'failed').length
        }
      })
    }

  } catch (error: any) {
    console.error('❌ Error in orchestrator execution:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to execute workflow',
      details: error.message
    })
  }
})

/**
 * GET /api/agents/orchestrator/progress/:mealPlanId
 * Get current workflow progress for a meal plan
 */
router.get('/orchestrator/progress/:mealPlanId', async (req, res) => {
  try {
    const { mealPlanId } = req.params

    // Get meal plan with all decisions
    const mealPlan = await getMealPlan(mealPlanId)
    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    // Analyze progress based on agent decisions
    const progress = {
      mealPlanId,
      status: mealPlan.status,
      totalSteps: 4,
      completedSteps: 0,
      currentStep: 'Not started',
      decisions: mealPlan.decisions,
      lastUpdate: mealPlan.decisions.length > 0 
        ? mealPlan.decisions[mealPlan.decisions.length - 1].createdAt 
        : mealPlan.createdAt
    }

    // Determine current step based on decisions
    const decisionTypes = mealPlan.decisions.map(d => d.decisionType)
    
    if (decisionTypes.includes('dietary_analysis') || decisionTypes.includes('dietary_refinement')) {
      progress.completedSteps++
      progress.currentStep = 'Dietary Analysis Complete'
    }
    
    if (mealPlan.recipes && mealPlan.recipes.length > 0) {
      progress.completedSteps++
      progress.currentStep = 'Recipe Selection Complete'
    }
    
    if (mealPlan.shoppingItems && mealPlan.shoppingItems.length > 0) {
      progress.completedSteps++
      progress.currentStep = 'Quantity Calculations Complete'
    }
    
    if (mealPlan.budgetAnalysis && mealPlan.budgetAnalysis.length > 0) {
      progress.completedSteps = 4
      progress.currentStep = 'Budget Optimization Complete'
    }

    res.json({
      success: true,
      progress
    })

  } catch (error: any) {
    console.error('❌ Error getting orchestrator progress:', error.message)
    res.status(500).json({
      error: 'Failed to get progress',
      details: error.message
    })
  }
})

export default router