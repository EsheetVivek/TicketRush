import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// Serverless-friendly: small pool per instance; use Neon's *pooled* connection string in production.
// Note: with prepare: false, postgres.js describes each parameterised query before running it, so
// every query costs two network round trips. Fewer statements per request matter most (m5b-speed.md).
const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20, ssl: url.includes("localhost") ? false : "require" });
export const db = drizzle(client, { schema });
export type DB = typeof db;
