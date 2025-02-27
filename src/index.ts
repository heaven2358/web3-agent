import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor } from "langchain/agents";
import { createToolCallingAgent } from "langchain/agents";
import { Calculator } from "@langchain/community/tools/calculator";
import { WebBrowser } from "langchain/tools/webbrowser";
import { OpenAIEmbeddings } from "@langchain/openai";
import { DragonflyDBMemory } from "./memory/dragonflydb.js";
import { createDragonflyClient } from "./util/dragonfly.js";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicTool } from "@langchain/core/tools";
import readline from 'readline';
import axios from 'axios';

dotenv.config();

// 创建readline接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 封装readline.question为Promise
const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

const createCryptoTrendsTool = () => {
  return new DynamicTool({
    name: "CryptoTrends",
    description: "获取当前热门加密货币趋势。不需要输入参数。",
    func: async () => {
      try {
        const response = await axios.get(
          "https://api.coingecko.com/api/v3/search/trending"
        );
        
        const coins = response.data.coins;
        let result = "当前热门加密货币趋势:\n\n";
        
        coins.forEach((coin: any, index: number) => {
          result += `${index + 1}. ${coin.item.name} (${coin.item.symbol})\n`;
          result += `   价格 (BTC): ${coin.item.price_btc}\n`;
          result += `   市值排名: #${coin.item.market_cap_rank}\n\n`;
        });
        
        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `获取加密货币趋势时出错: ${errorMessage}`;
      }
    }
  });
};

const createCryptoNewsTool = () => {
  return new DynamicTool({
    name: "CryptoNews",
    description: "获取最新的加密货币新闻。可以指定币种，如BTC、ETH，或者不指定获取综合新闻。",
    func: async (input: string) => {
      try {
        // 这里使用SerpAPI来获取新闻，因为没有免费的加密货币新闻API
        // 实际应用中可以替换为专业的加密货币新闻API
        const query = input.trim() ? 
          `${input} cryptocurrency news` : 
          "cryptocurrency news";
          
        // 这里简化处理，实际应用中应该调用SerpAPI
        return `关于"${query}"的最新新闻可以通过搜索工具获取。请使用SerpAPI工具搜索"${query}"获取最新资讯。`;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `获取加密货币新闻时出错: ${errorMessage}`;
      }
    }
  });
};

const main = async () => {
  // 确保环境变量已设置
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY 环境变量未设置");
  }

  // 初始化OpenAI模型
  const model = new ChatOpenAI({
    modelName: "gpt-3.5-turbo",
    temperature: 0.7,
  });

  // 初始化embeddings
  const embeddings = new OpenAIEmbeddings();

  // 连接DragonflyDB
  const dragonflyClient = await createDragonflyClient({
    host: process.env.DRAGONFLY_HOST || "localhost",
    port: parseInt(process.env.DRAGONFLY_PORT || "6379"),
  });
  
  // 创建基于DragonflyDB的记忆管理
  const memory = new DragonflyDBMemory({
    client: dragonflyClient,
    sessionId: "demo-session", 
    memoryKey: "chat_history",
  });

  // 设置Agent可用的工具
  const tools = [
    new SerpAPI(process.env.SERPAPI_API_KEY, {
      location: "Shanghai",
      hl: "zh-cn",
      gl: "cn",
    }),
    new Calculator(),
    new WebBrowser({
      model,
      embeddings,
    }),
    // 可以根据需要添加更多工具
    createCryptoTrendsTool(),
    createCryptoNewsTool()
  ];

  

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant who can search from google, when you don't know the answer, please use search tools to get result, and if I mentioned realtime or 实时, please use search tools"],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  // 创建Agent和执行器
  const agent = await createToolCallingAgent({ llm: model, tools, prompt });

  const executor = new AgentExecutor({
    agent,
    tools,
    memory,
    verbose: true,
  });

  // 添加工具检查
  console.log("可用工具列表:");
  tools.forEach((tool, index) => {
    console.log(`${index + 1}. ${tool.name}: ${tool.description}`);
  });

  console.log("\n欢迎使用AI助手，您可以提问任何问题。输入'exit'或'quit'退出。");
  
  // 开始交互循环
  let running = true;
  while (running) {
    const userInput = await question("\n请输入您的问题: ");
    
    // 检查退出命令
    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      running = false;
      console.log("感谢使用，再见！");
      continue;
    }
    
    try {
      console.log("正在处理您的问题，请稍候...");
      const result = await executor.invoke({
        input: userInput
      });
      
      console.log("\n回答:");
      console.log(result.output);
    } catch (error) {
      console.error("处理问题时出错:", error);
    }
  }

  // 关闭DragonflyDB连接和readline接口
  await dragonflyClient.quit();
  rl.close();
};

main().catch(console.error);

export { main };