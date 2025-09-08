import { PrismaClient } from '@prisma/client'

// Create a single instance of Prisma Client to be reused across the application
// This is a common pattern to avoid creating too many database connections
export const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'], // Enable logging for development
})

// Graceful shutdown - close database connections when app terminates
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

// Database health check function
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ Database connection successful')
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    return false
  }
}

// Example: Create a new meal plan (we'll use this later for testing)
export async function createMealPlan(data: {
  name: string
  attendeeCount: number
  startDate: Date
  endDate: Date
  budgetTotal?: number
}) {
  return await prisma.mealPlan.create({
    data: {
      ...data,
      status: 'planning',
    },
    // Include related data in the response
    include: {
      attendees: true,
      decisions: true,
      recipes: true,
      shoppingItems: true,
      budgetAnalysis: true,
    },
  })
}

// Example: Add attendees to a meal plan
export async function addAttendees(
  mealPlanId: string,
  attendees: Array<{
    name: string
    dietaryRestrictions: string[]
    foodPreferences: string[]
    specialNotes?: string
    dietarySeverity: string
  }>
) {
  return await prisma.attendee.createMany({
    data: attendees.map(attendee => ({
      ...attendee,
      mealPlanId,
    })),
  })
}