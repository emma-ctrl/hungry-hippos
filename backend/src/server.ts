/**
 * Express Server - Simple Architecture
 * 
 * This sets up our Express server with direct service imports
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

// Load environment variables
import 'dotenv/config'

// Import route handlers
import mealPlansRoutes from './routes/mealPlans.js'
import agentsRoutes from './routes/agents.js'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'meal-planning-backend' 
  })
})

// API routes
app.use('/api/meal-plans', mealPlansRoutes)
app.use('/api/agents', agentsRoutes)

// General 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.originalUrl,
      method: req.method
    })
  } else {
    res.status(404).json({ 
      error: 'Not found',
      path: req.originalUrl
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`❤️  Health check: http://localhost:${PORT}/health`)
})