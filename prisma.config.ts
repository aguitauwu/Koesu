import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join("prisma", "schema.prisma"),
  migrate: {
    adapter: async () => {
      const { PrismaLibSql } = await import("@prisma/adapter-libsql");
      const { createClient } = await import("@libsql/client");
      const client = createClient({
        url: process.env.DATABASE_URL ?? "file:./koesu.db",
      });
      return new PrismaLibSql(client);
    },
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./koesu.db",
  },
});
