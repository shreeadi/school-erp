import { defineConfig, env } from 'prisma/config';

// Migrations run as the schema owner. The API itself connects with the
// restricted runtime role (DATABASE_URL) so that Row-Level Security applies.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('MIGRATION_DATABASE_URL') },
});
