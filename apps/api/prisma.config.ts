import { defineConfig } from 'prisma/config';

// Migrations run as the schema owner. The API itself connects with the
// restricted runtime role (DATABASE_URL) so that Row-Level Security applies.
// The URL is optional here so `prisma generate` works without a database (CI, Docker builds).
const url = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
