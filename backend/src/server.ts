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

// API routes will be added here
// app.use('/api', routes)

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`❤️  Health check: http://localhost:${PORT}/health`)
})