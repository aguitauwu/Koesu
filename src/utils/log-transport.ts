import { once } from "events";
import { Transform } from "stream";

const GATEWAY_URL = `http://localhost:${process.env.KOESU_GATEWAY_PORT ?? 7333}/log`;

export default async function (opts: Record<string, unknown>) {
  const stream = new Transform({
    objectMode: true,
    transform(chunk, _enc, cb) {
      try {
        const log = JSON.parse(chunk.toString());
        fetch(GATEWAY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(log),
        }).catch(() => null);
      } catch {}
      cb();
    },
  });
  await once(stream, "readable").catch(() => null);
  return stream;
}
