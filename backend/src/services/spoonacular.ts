/**
 * Spoonacular Service - Recipe API integration
 * 
 * This service handles all interactions with the Spoonacular Recipe API
 * for searching recipes, getting details, and handling dietary restrictions
 */

import axios from 'axios'

const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY
const BASE_URL = 'https://api.spoonacular.com/recipes'

if (!SPOONACULAR_API_KEY) {
  console.warn('⚠️  SPOONACULAR_API_KEY not found in environment variables')
}

// Create axios instance with default config
export const spoonacularApi = axios.create({
  baseURL: BASE_URL,
  params: {
    apiKey: SPOONACULAR_API_KEY,
  },
  timeout: 10000,
})

export interface SearchRecipesOptions {
  query?: string
  diet?: string
  intolerances?: string[]
  type?: 'main course' | 'side dish' | 'dessert' | 'appetizer' | 'salad' | 'bread' | 'breakfast' | 'soup' | 'beverage' | 'sauce' | 'marinade' | 'fingerfood' | 'snack' | 'drink'
  cuisine?: string
  excludeIngredients?: string[]
  includeIngredients?: string[]
  maxReadyTime?: number
  minProtein?: number
  maxCalories?: number
  number?: number
  offset?: number
}

export interface Recipe {
  id: number
  title: string
  readyInMinutes: number
  servings: number
  image: string
  summary: string
  cuisines: string[]
  dishTypes: string[]
  diets: string[]
  extendedIngredients?: any[]
  nutrition?: any
  instructions?: string
}

export const searchRecipes = async (options: SearchRecipesOptions = {}): Promise<{
  results: Recipe[]
  totalResults: number
  offset: number
}> => {
  try {
    const {
      query,
      diet,
      intolerances = [],
      type,
      cuisine,
      excludeIngredients = [],
      includeIngredients = [],
      maxReadyTime,
      minProtein,
      maxCalories,
      number = 10,
      offset = 0
    } = options

    console.log(`🔍 Searching Spoonacular for recipes...`)
    console.log(`📋 Search criteria:`, { query, diet, intolerances, type, number })

    const params: any = {
      number,
      offset,
      addRecipeInformation: true,
      fillIngredients: true,
    }

    // Add optional parameters
    if (query) params.query = query
    if (diet) params.diet = diet
    if (intolerances.length > 0) params.intolerances = intolerances.join(',')
    if (type) params.type = type
    if (cuisine) params.cuisine = cuisine
    if (excludeIngredients.length > 0) params.excludeIngredients = excludeIngredients.join(',')
    if (includeIngredients.length > 0) params.includeIngredients = includeIngredients.join(',')
    if (maxReadyTime) params.maxReadyTime = maxReadyTime
    if (minProtein) params.minProtein = minProtein
    if (maxCalories) params.maxCalories = maxCalories

    const response = await spoonacularApi.get('/complexSearch', { params })

    console.log(`✅ Found ${response.data.totalResults} recipes, returning ${response.data.results.length}`)

    return {
      results: response.data.results || [],
      totalResults: response.data.totalResults || 0,
      offset: response.data.offset || 0
    }

  } catch (error: any) {
    console.error('❌ Spoonacular recipe search failed:', error.message)
    if (error.response) {
      console.error('Status:', error.response.status)
      console.error('Data:', error.response.data)
    }
    throw new Error(`Recipe search failed: ${error.message}`)
  }
}

export const getRecipeDetails = async (recipeIds: number[]): Promise<Recipe[]> => {
  try {
    console.log(`📖 Getting details for ${recipeIds.length} recipes: ${recipeIds.join(', ')}`)

    const promises = recipeIds.map(async (id) => {
      const params = {
        includeNutrition: true,
        addWinePairing: false,
        addTasteData: false,
      }

      const response = await spoonacularApi.get(`/${id}/information`, { params })
      return response.data
    })

    const recipes = await Promise.all(promises)
    console.log(`✅ Successfully retrieved details for ${recipes.length} recipes`)

    return recipes

  } catch (error: any) {
    console.error('❌ Failed to get recipe details:', error.message)
    throw new Error(`Failed to get recipe details: ${error.message}`)
  }
}

export const getRecipeRecommendations = async (
  dietaryRestrictions: string[], 
  mealType: string, 
  servings: number
): Promise<Recipe[]> => {
  try {
    console.log(`🎯 Getting recipe recommendations:`)
    console.log(`- Dietary restrictions: ${dietaryRestrictions.join(', ')}`)
    console.log(`- Meal type: ${mealType}`)
    console.log(`- Servings: ${servings}`)

    // Map dietary restrictions to Spoonacular format
    const dietaryMapping: Record<string, { diet?: string, intolerances?: string[] }> = {
      'vegetarian': { diet: 'vegetarian' },
      'vegan': { diet: 'vegan' },
      'gluten-free': { intolerances: ['gluten'] },
      'dairy-free': { intolerances: ['dairy'] },
      'nut-allergy': { intolerances: ['tree nut', 'peanut'] },
      'pescatarian': { diet: 'pescetarian' },
      'keto': { diet: 'ketogenic' },
      'paleo': { diet: 'paleo' },
      'kosher': { diet: 'kosher' },
      'halal': { diet: 'halal' },
    }

    let diet: string | undefined
    const intolerances: string[] = []

    dietaryRestrictions.forEach(restriction => {
      const mapping = dietaryMapping[restriction.toLowerCase()]
      if (mapping) {
        if (mapping.diet) diet = mapping.diet
        if (mapping.intolerances) intolerances.push(...mapping.intolerances)
      }
    })

    const searchOptions: SearchRecipesOptions = {
      type: mealType as any,
      ...(diet && { diet }),
      intolerances,
      number: 20, // Get more options for better variety
      maxReadyTime: mealType === 'breakfast' ? 30 : 60, // Faster breakfast prep
    }

    const results = await searchRecipes(searchOptions)
    
    // Filter and score recipes based on servings and other criteria
    const scoredRecipes = results.results
      .filter(recipe => recipe.servings > 0) // Valid serving size
      .map(recipe => {
        let score = 0
        
        // Prefer recipes closer to target serving size
        const servingDiff = Math.abs(recipe.servings - servings)
        score += Math.max(0, 10 - servingDiff) // 10 points max for exact serving match
        
        // Prefer shorter cooking times for breakfast
        if (mealType === 'breakfast' && recipe.readyInMinutes <= 20) {
          score += 5
        }
        
        // Bonus for having nutritional data
        if (recipe.nutrition) score += 3
        
        // Bonus for having detailed ingredients
        if (recipe.extendedIngredients && recipe.extendedIngredients.length > 0) {
          score += 2
        }

        return { ...recipe, score }
      })
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, 10) // Return top 10

    console.log(`✅ Returning ${scoredRecipes.length} recommended recipes`)
    return scoredRecipes

  } catch (error: any) {
    console.error('❌ Failed to get recipe recommendations:', error.message)
    throw new Error(`Failed to get recipe recommendations: ${error.message}`)
  }
}