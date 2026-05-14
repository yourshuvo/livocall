import mongoose from 'mongoose'

declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn: Promise<typeof mongoose> | undefined
}

const MONGODB_URI = process.env.MONGODB_URI

export async function connectMongo() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Copy apps/web/.env.example to apps/web/.env.local')
  }
  if (!global.__mongooseConn) {
    global.__mongooseConn = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
  }
  return global.__mongooseConn
}

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI)
}
