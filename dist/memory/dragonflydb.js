import { BaseChatMemory } from "langchain/memory";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
export class DragonflyDBMemory extends BaseChatMemory {
    constructor(fields) {
        super(fields);
        this.client = fields.client;
        this.sessionId = fields.sessionId;
        this.memoryKey = fields.memoryKey || "chat_history";
        this.ttl = fields.ttl;
    }
    get memoryKeys() {
        return [this.memoryKey];
    }
    async saveContext(inputValues, outputValues) {
        const humanKey = `${this.sessionId}:${this.memoryKey}:human`;
        const aiKey = `${this.sessionId}:${this.memoryKey}:ai`;
        const inputKey = this.inputKey || "input";
        const outputKey = this.outputKey || "output";
        // 保存人类消息
        await this.client.rPush(humanKey, inputValues[inputKey]);
        // 保存AI消息
        await this.client.rPush(aiKey, outputValues[outputKey]);
        // 如果指定了TTL，设置过期时间
        if (this.ttl) {
            await this.client.expire(humanKey, this.ttl);
            await this.client.expire(aiKey, this.ttl);
        }
    }
    async loadMemoryVariables() {
        const humanKey = `${this.sessionId}:${this.memoryKey}:human`;
        const aiKey = `${this.sessionId}:${this.memoryKey}:ai`;
        const humanMessages = await this.client.lRange(humanKey, 0, -1);
        const aiMessages = await this.client.lRange(aiKey, 0, -1);
        const messages = [];
        // 交错排列消息，按照正确的顺序
        const maxLen = Math.max(humanMessages.length, aiMessages.length);
        for (let i = 0; i < maxLen; i++) {
            if (i < humanMessages.length) {
                messages.push(new HumanMessage(humanMessages[i]));
            }
            if (i < aiMessages.length) {
                messages.push(new AIMessage(aiMessages[i]));
            }
        }
        return { [this.memoryKey]: messages };
    }
    async clear() {
        const humanKey = `${this.sessionId}:${this.memoryKey}:human`;
        const aiKey = `${this.sessionId}:${this.memoryKey}:ai`;
        await this.client.del(humanKey);
        await this.client.del(aiKey);
    }
}
