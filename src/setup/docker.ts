import { writeFileSync } from "fs";

interface DockerConfig {
  dbType: "postgresql" | "mariadb";
  dbUser: string;
  dbPass: string;
  dbName: string;
  lavalinkPassword: string;
}

export async function generateDockerCompose(config: DockerConfig): Promise<void> {
  const db = config.dbType === "postgresql"
    ? `
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${config.dbUser}
      POSTGRES_PASSWORD: ${config.dbPass}
      POSTGRES_DB: ${config.dbName}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"`
    : `
  mariadb:
    image: mariadb:11
    restart: unless-stopped
    environment:
      MARIADB_USER: ${config.dbUser}
      MARIADB_PASSWORD: ${config.dbPass}
      MARIADB_DATABASE: ${config.dbName}
      MARIADB_ROOT_PASSWORD: ${config.dbPass}
    volumes:
      - mariadb_data:/var/lib/mysql
    ports:
      - "3306:3306"`;

  const volume = config.dbType === "postgresql" ? "postgres_data:" : "mariadb_data:";

  const compose = `services:
${db}

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  lavalink:
    image: ghcr.io/lavalink-devs/lavalink:4
    restart: unless-stopped
    volumes:
      - ./application.yml:/opt/Lavalink/application.yml
      - ./plugins:/opt/Lavalink/plugins
    ports:
      - "2333:2333"
    depends_on:
      - redis

volumes:
  ${volume}
  redis_data:
`;

  writeFileSync("docker-compose.yml", compose);
}
