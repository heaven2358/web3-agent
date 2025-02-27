import { createClient } from "redis";

export interface DragonflyConfig {
  host: string;
  port: number;
  password?: string;
}

export async function createDragonflyClient(config: DragonflyConfig) {
  const client = createClient({
    url: `redis://${config.host}:${config.port}`,
    password: config.password,
  });

  await client.connect();
  console.log("成功连接到DragonflyDB");
  return client;
} 