import { createClient } from "redis";
export async function createDragonflyClient(config) {
    const client = createClient({
        url: `redis://${config.host}:${config.port}`,
        password: config.password,
    });
    await client.connect();
    console.log("成功连接到DragonflyDB");
    return client;
}
