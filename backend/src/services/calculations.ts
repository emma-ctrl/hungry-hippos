/**
 * Calculations Service - Pure functions for meal planning calculations
 * 
 * This service handles deterministic calculations that don't require external APIs:
 * - Recipe scaling and ingredient calculations
 * - Cost estimations
 * - Dietary complexity analysis
 * - Shopping list organization
 */

export interface ScaledIngredient {
  id: number
  name: string
  amount: number
  unit: string
  originalAmount: number
  scaleFactor: number
  aisle?: string
}

export interface ConsolidatedIngredient {
  name: string
  totalAmount: number
  unit: string
  sources: string[] // Which recipes this ingredient comes from
  aisle: string // Always has a value, defaults to "Other" if not specified
}

export interface AttendeeAnalysis {
  totalCount: number
  dietaryComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex'
  restrictionCounts: Record<string, number>
  severityBreakdown: Record<string, number>
}

/**
 * Scale recipe ingredients for target number of servings
 */
export const scaleRecipeIngredients = (recipe: any, targetServings: number): ScaledIngredient[] => {
  if (!recipe.servings || recipe.servings === 0) {
    throw new Error(`Recipe "${recipe.title}" has invalid serving count`)
  }

  const scaleFactor = targetServings / recipe.servings
  
  console.log(`📊 Scaling "${recipe.title}": ${recipe.servings} → ${targetServings} servings (${scaleFactor.toFixed(2)}x)`)

  if (!recipe.extendedIngredients) {
    console.warn(`Recipe "${recipe.title}" has no ingredient data`)
    return []
  }

  return recipe.extendedIngredients.map((ingredient: any) => ({
    id: ingredient.id,
    name: ingredient.name,
    amount: Math.round((ingredient.amount * scaleFactor) * 100) / 100,
    unit: ingredient.unit,
    originalAmount: ingredient.amount,
    scaleFactor,
    aisle: ingredient.aisle
  }))
}

/**
 * Consolidate ingredients from multiple recipes
 */
export const consolidateIngredients = (recipeIngredients: Record<string, ScaledIngredient[]>): ConsolidatedIngredient[] => {
  const consolidated: Record<string, ConsolidatedIngredient> = {}

  Object.entries(recipeIngredients).forEach(([recipeName, ingredients]) => {
    ingredients.forEach(ingredient => {
      const key = `${ingredient.name.toLowerCase()}_${ingredient.unit.toLowerCase()}`
      
      if (consolidated[key]) {
        // Add to existing ingredient
        consolidated[key].totalAmount += ingredient.amount
        if (!consolidated[key].sources.includes(recipeName)) {
          consolidated[key].sources.push(recipeName)
        }
      } else {
        // Create new consolidated ingredient
        consolidated[key] = {
          name: ingredient.name,
          totalAmount: ingredient.amount,
          unit: ingredient.unit,
          sources: [recipeName],
          aisle: ingredient.aisle || 'Other'
        }
      }
    })
  })

  // Round amounts and sort by name
  return Object.values(consolidated)
    .map(ingredient => ({
      ...ingredient,
      totalAmount: Math.round(ingredient.totalAmount * 100) / 100
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Analyze attendee dietary complexity
 */
export const analyzeDietaryComplexity = (attendees: Array<{
  dietaryRestrictions: string[]
  dietarySeverity: string
}>): AttendeeAnalysis => {
  const totalCount = attendees.length
  const restrictionCounts: Record<string, number> = {}
  const severityBreakdown: Record<string, number> = {}

  // Count restrictions and severity levels
  attendees.forEach(attendee => {
    // Count dietary restrictions
    attendee.dietaryRestrictions.forEach(restriction => {
      const key = restriction.toLowerCase()
      restrictionCounts[key] = (restrictionCounts[key] || 0) + 1
    })

    // Count severity levels
    const severity = attendee.dietarySeverity.toLowerCase()
    severityBreakdown[severity] = (severityBreakdown[severity] || 0) + 1
  })

  // Determine complexity based on restrictions and severity
  const totalRestrictions = Object.values(restrictionCounts).reduce((sum, count) => sum + count, 0)
  const highSeverityCount = (severityBreakdown['severe'] || 0) + (severityBreakdown['medical'] || 0)
  
  let dietaryComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex'
  
  if (totalRestrictions === 0) {
    dietaryComplexity = 'simple'
  } else if (totalRestrictions <= 3 && highSeverityCount === 0) {
    dietaryComplexity = 'moderate'
  } else if (totalRestrictions <= 8 && highSeverityCount <= 2) {
    dietaryComplexity = 'complex'
  } else {
    dietaryComplexity = 'very_complex'
  }

  return {
    totalCount,
    dietaryComplexity,
    restrictionCounts,
    severityBreakdown
  }
}

/**
 * Generate meal slots for a date range
 */
export const generateMealSlots = (
  startDate: Date,
  endDate: Date,
  mealsPerDay: ('breakfast' | 'lunch' | 'dinner')[] = ['breakfast', 'lunch', 'dinner']
): string[] => {
  const slots: string[] = []
  const currentDate = new Date(startDate)
  let dayNumber = 1

  while (currentDate <= endDate) {
    mealsPerDay.forEach(meal => {
      slots.push(`${meal}_day${dayNumber}`)
    })
    
    currentDate.setDate(currentDate.getDate() + 1)
    dayNumber++
  }

  return slots
}

/**
 * Estimate ingredient costs (simple implementation)
 */
export const estimateIngredientCost = (ingredientName: string, amount: number, unit: string): number => {
  // Simple pricing estimates (in USD)
  const ingredientPrices: Record<string, { pricePerUnit: number, unit: string }> = {
    // Proteins
    'chicken': { pricePerUnit: 6.99, unit: 'lb' },
    'beef': { pricePerUnit: 8.99, unit: 'lb' },
    'salmon': { pricePerUnit: 12.99, unit: 'lb' },
    'eggs': { pricePerUnit: 3.49, unit: 'dozen' },
    
    // Vegetables
    'onion': { pricePerUnit: 1.29, unit: 'lb' },
    'garlic': { pricePerUnit: 0.50, unit: 'head' },
    'tomato': { pricePerUnit: 2.99, unit: 'lb' },
    'lettuce': { pricePerUnit: 1.99, unit: 'head' },
    
    // Pantry staples
    'rice': { pricePerUnit: 2.99, unit: 'lb' },
    'pasta': { pricePerUnit: 1.49, unit: 'lb' },
    'flour': { pricePerUnit: 3.99, unit: 'bag' },
    'oil': { pricePerUnit: 4.99, unit: 'bottle' },
  }

  const normalizedName = ingredientName.toLowerCase()
  const defaultPricing = { pricePerUnit: 2.50, unit: 'item' }
  
  // Try to find a matching ingredient, with guaranteed fallback
  let pricing = ingredientPrices[normalizedName]
  
  // If no exact match, try partial matches
  if (!pricing) {
    const partialMatch = Object.keys(ingredientPrices).find(key => 
      normalizedName.includes(key) || key.includes(normalizedName)
    )
    pricing = partialMatch ? ingredientPrices[partialMatch] : defaultPricing
  }
  
  // Use non-null assertion since we guaranteed pricing exists
  const guaranteedPricing = pricing!
  
  // Simple unit conversion factors (rough estimates)
  const unitConversions: Record<string, number> = {
    'oz': 0.0625, // oz to lb
    'gram': 0.00220462, // gram to lb
    'kg': 2.20462, // kg to lb
    'cup': 0.25, // rough estimate for cup to lb
    'tablespoon': 0.015625, // tbsp to lb
    'teaspoon': 0.005208, // tsp to lb
  }
  
  let cost = guaranteedPricing.pricePerUnit
  
  // Apply unit conversion if needed
  if (unit.toLowerCase() !== guaranteedPricing.unit.toLowerCase()) {
    const conversionFactor = unitConversions[unit.toLowerCase()] || 1
    cost = guaranteedPricing.pricePerUnit * (amount * conversionFactor)
  } else {
    cost = guaranteedPricing.pricePerUnit * amount
  }
  
  return Math.round(cost * 100) / 100 // Round to 2 decimal places
}

/**
 * Calculate total cost for a shopping list
 */
export const calculateTotalCost = (ingredients: ConsolidatedIngredient[]): {
  totalCost: number
  itemizedCosts: Array<{
    name: string
    amount: number
    unit: string
    estimatedCost: number
  }>
} => {
  const itemizedCosts = ingredients.map(ingredient => {
    const estimatedCost = estimateIngredientCost(
      ingredient.name,
      ingredient.totalAmount,
      ingredient.unit
    )
    
    return {
      name: ingredient.name,
      amount: ingredient.totalAmount,
      unit: ingredient.unit,
      estimatedCost
    }
  })
  
  const totalCost = itemizedCosts.reduce((sum, item) => sum + item.estimatedCost, 0)
  
  return {
    totalCost: Math.round(totalCost * 100) / 100,
    itemizedCosts
  }
}

/**
 * Organize shopping list by store sections
 */
export const organizeShoppingList = (ingredients: ConsolidatedIngredient[]): Record<string, ConsolidatedIngredient[]> => {
  const storeSections: Record<string, string[]> = {
    'produce': ['vegetable', 'fruit', 'herb', 'lettuce', 'tomato', 'onion', 'garlic', 'pepper'],
    'meat': ['chicken', 'beef', 'pork', 'turkey', 'salmon', 'fish', 'shrimp'],
    'dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'eggs'],
    'pantry': ['rice', 'pasta', 'flour', 'sugar', 'salt', 'spice', 'oil', 'vinegar'],
    'frozen': ['frozen'],
    'bakery': ['bread', 'bun', 'roll']
  }

  const organized: Record<string, ConsolidatedIngredient[]> = {
    'Produce': [],
    'Meat & Seafood': [],
    'Dairy': [],
    'Pantry': [],
    'Frozen': [],
    'Bakery': [],
    'Other': []
  }
  
  ingredients.forEach(ingredient => {
    const ingredientName = ingredient.name.toLowerCase()
    let section = 'Other'
    
    // Find matching section
    for (const [sectionName, keywords] of Object.entries(storeSections)) {
      if (keywords.some(keyword => ingredientName.includes(keyword))) {
        section = sectionName.charAt(0).toUpperCase() + sectionName.slice(1)
        if (section === 'Meat') section = 'Meat & Seafood'
        break
      }
    }
    
    organized[section]!.push(ingredient)
  })
  
  // Sort ingredients within each section
  Object.keys(organized).forEach(section => {
    const sectionItems = organized[section]
    if (sectionItems) {
      sectionItems.sort((a, b) => a.name.localeCompare(b.name))
    }
  })
  
  return organized
}