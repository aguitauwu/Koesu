import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
      ignore: "pid,hostname",
      messageFormat: "[Koesu] {msg}",
    },
  },
});

export const createLogger = (name: string) => logger.child({ module: name });
