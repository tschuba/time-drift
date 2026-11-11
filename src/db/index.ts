import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const url = process.env.DATABASE_URL ?? "postgres://timedrift:timedrift@localhost:5432/timedrift";
export const client = postgres(url, { max: 5 });
export const db = drizzle(client, { schema });
