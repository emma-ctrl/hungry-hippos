/**
 * Meal Plans Routes - Handle meal plan CRUD operations
 * 
 * This file defines REST API endpoints for:
 * - Creating new meal plans
 * - Getting meal plan data with all related information
 * - Adding attendees to existing meal plans
 */

import { Router } from 'express'
import { 
  createMealPlan, 
  getMealPlan, 
  addAttendees, 
  getAttendees,
  updateMealPlanStatus 
} from '../services/database.js'

const router = Router()

/**
 * POST /api/meal-plans
 * Create a new meal plan
 * 
 * Expected body:
 * {
 *   name: string,
 *   attendeeCount: number,
 *   startDate: string (ISO date),
 *   endDate: string (ISO date),
 *   budgetTotal?: number
 * }
 */
router.post('/', async (req, res) => {
  try {
    console.log('📝 Creating new meal plan:', req.body.name)

    // Validate required fields
    const { name, attendeeCount, startDate, endDate, budgetTotal } = req.body

    if (!name || !attendeeCount || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields: name, attendeeCount, startDate, endDate'
      })
    }

    // Validate data types and values
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name must be a non-empty string' })
    }

    if (typeof attendeeCount !== 'number' || attendeeCount < 1 || attendeeCount > 100) {
      return res.status(400).json({ error: 'Attendee count must be between 1 and 100' })
    }

    // Convert date strings to Date objects and validate
    const startDateObj = new Date(startDate)
    const endDateObj = new Date(endDate)

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use ISO date strings.' })
    }

    if (startDateObj >= endDateObj) {
      return res.status(400).json({ error: 'End date must be after start date' })
    }

    // Create the meal plan
    const mealPlan = await createMealPlan({
      name: name.trim(),
      attendeeCount,
      startDate: startDateObj,
      endDate: endDateObj,
      budgetTotal: budgetTotal || null
    })

    console.log(`✅ Created meal plan: ${mealPlan.id}`)

    res.status(201).json({
      success: true,
      mealPlan
    })

  } catch (error: any) {
    console.error('❌ Error creating meal plan:', error.message)
    res.status(500).json({
      error: 'Failed to create meal plan',
      details: error.message
    })
  }
})

/**
 * GET /api/meal-plans/:id
 * Get a meal plan with all related data
 * 
 * Returns complete meal plan including:
 * - Basic meal plan info
 * - All attendees with dietary restrictions
 * - Agent decisions made so far
 * - Selected recipes
 * - Shopping list items
 * - Budget analysis
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    console.log(`📖 Getting meal plan: ${id}`)

    // Validate ID format (Prisma cuid)
    if (!id || typeof id !== 'string' || id.length < 10) {
      return res.status(400).json({ error: 'Invalid meal plan ID format' })
    }

    const mealPlan = await getMealPlan(id)

    if (!mealPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    console.log(`✅ Found meal plan: ${mealPlan.name} (${mealPlan.attendees.length} attendees)`)

    res.json({
      success: true,
      mealPlan
    })

  } catch (error: any) {
    console.error('❌ Error getting meal plan:', error.message)
    res.status(500).json({
      error: 'Failed to get meal plan',
      details: error.message
    })
  }
})

/**
 * POST /api/meal-plans/:id/attendees
 * Add attendees to an existing meal plan
 * 
 * Expected body:
 * {
 *   attendees: [
 *     {
 *       name: string,
 *       dietaryRestrictions: string[],
 *       foodPreferences: string[],
 *       specialNotes?: string,
 *       dietarySeverity: 'mild' | 'moderate' | 'severe' | 'medical'
 *     }
 *   ]
 * }
 */
router.post('/:id/attendees', async (req, res) => {
  try {
    const { id } = req.params
    const { attendees } = req.body

    console.log(`👥 Adding attendees to meal plan: ${id}`)

    // Validate meal plan ID
    if (!id || typeof id !== 'string' || id.length < 10) {
      return res.status(400).json({ error: 'Invalid meal plan ID format' })
    }

    // Validate attendees array
    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({ error: 'Attendees must be a non-empty array' })
    }

    // Validate each attendee
    for (let i = 0; i < attendees.length; i++) {
      const attendee = attendees[i]
      
      if (!attendee.name || typeof attendee.name !== 'string' || attendee.name.trim().length === 0) {
        return res.status(400).json({ 
          error: `Attendee ${i + 1}: name is required and must be a non-empty string` 
        })
      }

      if (!Array.isArray(attendee.dietaryRestrictions)) {
        return res.status(400).json({ 
          error: `Attendee ${i + 1}: dietaryRestrictions must be an array` 
        })
      }

      if (!Array.isArray(attendee.foodPreferences)) {
        return res.status(400).json({ 
          error: `Attendee ${i + 1}: foodPreferences must be an array` 
        })
      }

      const validSeverities = ['mild', 'moderate', 'severe', 'medical']
      if (attendee.dietarySeverity && !validSeverities.includes(attendee.dietarySeverity)) {
        return res.status(400).json({
          error: `Attendee ${i + 1}: dietarySeverity must be one of: ${validSeverities.join(', ')}`
        })
      }
    }

    // Check if meal plan exists
    const existingPlan = await getMealPlan(id)
    if (!existingPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    // Clean up attendee data
    const cleanAttendees = attendees.map(attendee => ({
      name: attendee.name.trim(),
      dietaryRestrictions: attendee.dietaryRestrictions.filter((r: string) => r.trim().length > 0),
      foodPreferences: attendee.foodPreferences.filter((p: string) => p.trim().length > 0),
      specialNotes: attendee.specialNotes?.trim() || null,
      dietarySeverity: attendee.dietarySeverity || 'moderate'
    }))

    // Add attendees to database
    await addAttendees(id, cleanAttendees)

    // Get updated meal plan with new attendees
    const updatedPlan = await getMealPlan(id)

    console.log(`✅ Added ${attendees.length} attendees to meal plan ${id}`)

    res.status(201).json({
      success: true,
      message: `Added ${attendees.length} attendees`,
      mealPlan: updatedPlan
    })

  } catch (error: any) {
    console.error('❌ Error adding attendees:', error.message)
    res.status(500).json({
      error: 'Failed to add attendees',
      details: error.message
    })
  }
})

/**
 * PUT /api/meal-plans/:id/status
 * Update meal plan status
 * 
 * Expected body:
 * {
 *   status: string
 * }
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    console.log(`🔄 Updating meal plan ${id} status to: ${status}`)

    // Validate inputs
    if (!id || typeof id !== 'string' || id.length < 10) {
      return res.status(400).json({ error: 'Invalid meal plan ID format' })
    }

    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'Status is required and must be a string' })
    }

    const validStatuses = ['planning', 'processing', 'completed', 'error']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${validStatuses.join(', ')}`
      })
    }

    // Check if meal plan exists
    const existingPlan = await getMealPlan(id)
    if (!existingPlan) {
      return res.status(404).json({ error: 'Meal plan not found' })
    }

    // Update status
    const updatedPlan = await updateMealPlanStatus(id, status)

    console.log(`✅ Updated meal plan ${id} status to: ${status}`)

    res.json({
      success: true,
      mealPlan: updatedPlan
    })

  } catch (error: any) {
    console.error('❌ Error updating meal plan status:', error.message)
    res.status(500).json({
      error: 'Failed to update meal plan status',
      details: error.message
    })
  }
})

export default router