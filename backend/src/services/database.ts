/**
 * Database Service - All Prisma operations
 * 
 * This service handles all database interactions using Prisma ORM
 */

import { PrismaClient } from '@prisma/client'

// Create singleton Prisma instance
export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})

// Meal Plan operations
export const createMealPlan = async (data: {
  name: string
  attendeeCount: number
  startDate: Date
  endDate: Date
  budgetTotal?: number
}) => {
  return prisma.mealPlan.create({
    data: {
      ...data,
      status: 'planning',
    },
    include: {
      attendees: true,
      decisions: true,
      recipes: true,
      shoppingItems: true,
      budgetAnalysis: true,
    },
  })
}

export const getMealPlan = async (id: string) => {
  return prisma.mealPlan.findUnique({
    where: { id },
    include: {
      attendees: true,
      decisions: { orderBy: { createdAt: 'asc' } },
      recipes: { orderBy: { mealSlot: 'asc' } },
      shoppingItems: { orderBy: [{ storeSection: 'asc' }, { priority: 'desc' }] },
      budgetAnalysis: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  })
}

export const updateMealPlanStatus = async (id: string, status: string) => {
  return prisma.mealPlan.update({
    where: { id },
    data: { status }
  })
}

// Attendee operations
export const addAttendees = async (mealPlanId: string, attendees: Array<{
  name: string
  dietaryRestrictions: string[]
  foodPreferences: string[]
  specialNotes?: string
  dietarySeverity: string
}>) => {
  return prisma.attendee.createMany({
    data: attendees.map(attendee => ({
      ...attendee,
      mealPlanId,
    })),
  })
}

export const getAttendees = async (mealPlanId: string) => {
  return prisma.attendee.findMany({
    where: { mealPlanId },
  })
}

// Agent decision tracking
export const saveAgentDecision = async (
  mealPlanId: string,
  agentType: 'dietary' | 'meal_planner' | 'budget' | 'orchestrator',
  decisionType: string,
  decisionData: any,
  reasoning: string,
  confidenceScore?: number
) => {
  return prisma.agentDecision.create({
    data: {
      mealPlanId,
      agentType,
      decisionType,
      decisionData,
      reasoning,
      confidenceScore: confidenceScore ?? null,
    }
  })
}

export const getAgentDecisions = async (mealPlanId: string) => {
  return prisma.agentDecision.findMany({
    where: { mealPlanId },
    orderBy: { createdAt: 'asc' }
  })
}

// Recipe operations
export const saveSelectedRecipe = async (
  mealPlanId: string,
  mealSlot: string,
  spoonacularRecipeId: number,
  recipeName: string,
  selectionReasoning: string,
  estimatedServings: number,
  scaledIngredients: any,
  confidenceScore?: number
) => {
  return prisma.selectedRecipe.create({
    data: {
      mealPlanId,
      mealSlot,
      spoonacularRecipeId,
      recipeName,
      selectionReasoning,
      estimatedServings,
      scaledIngredients,
      confidenceScore: confidenceScore ?? null,
    }
  })
}

export const getSelectedRecipes = async (mealPlanId: string) => {
  return prisma.selectedRecipe.findMany({
    where: { mealPlanId },
    orderBy: { mealSlot: 'asc' }
  })
}

// Shopping list operations
export const saveShoppingItems = async (
  mealPlanId: string,
  items: Array<{
    ingredientName: string
    quantity: number
    unit: string
    estimatedCost?: number
    storeSection?: string
    optimizationReasoning?: string
    priority: number
  }>
) => {
  return prisma.shoppingItem.createMany({
    data: items.map(item => ({
      ...item,
      mealPlanId,
    }))
  })
}

export const getShoppingItems = async (mealPlanId: string) => {
  return prisma.shoppingItem.findMany({
    where: { mealPlanId },
    orderBy: [
      { storeSection: 'asc' },
      { priority: 'desc' },
      { ingredientName: 'asc' }
    ]
  })
}

// Budget analysis operations
export const saveBudgetAnalysis = async (
  mealPlanId: string,
  totalCost: number,
  costBreakdown: any,
  optimizationSuggestions: string,
  reasoning: string
) => {
  return prisma.budgetAnalysis.create({
    data: {
      mealPlanId,
      totalCost,
      costBreakdown,
      optimizationSuggestions,
      reasoning,
    }
  })
}

export const getBudgetAnalysis = async (mealPlanId: string) => {
  return prisma.budgetAnalysis.findFirst({
    where: { mealPlanId },
    orderBy: { createdAt: 'desc' }
  })
}

// Health check
export const checkConnection = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ Database connection successful')
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    return false
  }
}

// Cleanup
export const disconnect = async () => {
  await prisma.$disconnect()
}