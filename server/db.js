const mongoose = require('mongoose')
const config = require('./config')

// Connect to MongoDB. Returns the mongoose.connect promise so the caller can
// decide how to handle failure — the HTTP server treats a down Mongo as
// non-fatal (Sheets/Upwork features keep working).
const connectMongo = () => {
  mongoose.set('bufferCommands', false)
  mongoose.set('strictQuery', true)

  mongoose.connection.on('error', (err) => {
    console.warn('[mongo] connection error:', err.message)
  })
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected')
  })

  return mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })
}

module.exports = { connectMongo }
