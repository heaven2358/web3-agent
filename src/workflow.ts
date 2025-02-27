import dotenv from 'dotenv';
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Calculator } from "@langchain/community/tools/calculator";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { DynamicTool } from "@langchain/core/tools";
import axios from 'axios';

dotenv.config();

// 确保环境变量已设置
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY 环境变量未设置");
}

// 初始化OpenAI模型
const model = new ChatOpenAI({
  modelName: "o1"
});

// 创建加密货币趋势查询工具
const createCryptoTrendsTool = () => {
  return new DynamicTool({
    name: "CryptoTrends",
    description: "获取当前热门加密货币趋势",
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

// 创建搜索工具
const searchTool = new SerpAPI(process.env.SERPAPI_API_KEY, {
  location: "Shanghai",
  hl: "zh-cn",
  gl: "cn",
});

// 创建计算工具
const calculatorTool = new Calculator();

// 创建工作流

// 1. 获取加密货币趋势
const cryptoTrendsChain = RunnableSequence.from([
  createCryptoTrendsTool(),
  new StringOutputParser(),
  (cryptoTrends) => ({cryptoTrends}),
  PromptTemplate.fromTemplate(
    "以下是当前热门加密货币趋势数据:\n\n{cryptoTrends}\n\n请分析这些趋势。"
  ),
  model,
  new StringOutputParser(),
]);

// 2. 搜索全球经济新闻
const economicNewsChain = RunnableSequence.from([
  async () => "latest global economic news affecting cryptocurrency",
  searchTool,
  new StringOutputParser(),
  (economicNews) => ({economicNews}),
  PromptTemplate.fromTemplate(
    "以下是最新的全球经济新闻:\n\n{economicNews}\n\n请总结这些新闻对加密货币市场的潜在影响。"
  ),
  model,
  new StringOutputParser(),
]);

// 3. 计算投资回报率 - 修改为使用搜索工具获取价格，然后使用计算器
const investmentAnalysisChain = RunnableSequence.from([
  // 第一步：搜索比特币历史价格
  async () => "比特币一年前的价格和当前价格",
  searchTool,
  new StringOutputParser(),
  // 第二步：让模型提取价格并计算回报率
  (searchResults) => ({searchResults}),
  PromptTemplate.fromTemplate(`
    基于以下搜索结果，请提取比特币一年前的价格和当前价格，然后计算投资回报率：
    
    {searchResults}
    
    请按以下格式回答：
    1. 一年前比特币价格：X美元
    2. 当前比特币价格：Y美元
    3. 投资回报率计算：(Y-X)/X * 100% = Z%
    4. 如果一年前投资10,000美元，现在价值：10,000 * (1 + Z%) = W美元
  `),
  model,
  new StringOutputParser(),
]);

// 4. 组合所有信息并生成最终分析
const finalAnalysisPrompt = PromptTemplate.fromTemplate(`
你是一位加密货币和金融市场专家。请基于以下信息，为投资者提供一份全面的市场分析和投资建议:

加密货币趋势分析:
{cryptoAnalysis}

全球经济影响:
{economicAnalysis}

投资回报计算:
{investmentAnalysis}

请提供:
1. 当前市场状况的总结
2. 短期（1-3个月）市场预测
3. 长期投资策略建议
4. 潜在风险因素
5. 值得关注的新兴加密货币项目

以专业、客观的语气撰写，同时确保内容易于理解。
`);

// 组合工作流
const workflowChain = RunnableSequence.from([
  {
    cryptoAnalysis: cryptoTrendsChain,
    economicAnalysis: economicNewsChain,
    investmentAnalysis: investmentAnalysisChain,  // 使用新的链
  },
  finalAnalysisPrompt,
  model,
  new StringOutputParser(),
]);

// 执行工作流
async function runWorkflow() {
  console.log("开始执行加密货币分析工作流...\n");
  
  // 单独执行每个链并打印结果
  console.log("===== 步骤1: 获取加密货币趋势 =====");
  console.log("调用加密货币趋势API...");
  const cryptoTool = createCryptoTrendsTool();
  const cryptoRawData = await cryptoTool.invoke("");
  console.log("原始加密货币数据:", cryptoRawData);
  
  const cryptoAnalysis = await cryptoTrendsChain.invoke({});
  console.log("\n加密货币趋势分析结果:");
  console.log(cryptoAnalysis);
  console.log("\n===== 步骤1完成 =====\n");
  
  console.log("===== 步骤2: 获取全球经济新闻 =====");
  console.log("搜索经济新闻...");
  const searchQuery = "latest global economic news affecting cryptocurrency";
  const searchResults = await searchTool.invoke(searchQuery);
  console.log("搜索结果:", searchResults);
  
  const economicAnalysis = await economicNewsChain.invoke({});
  console.log("\n经济新闻分析结果:");
  console.log(economicAnalysis);
  console.log("\n===== 步骤2完成 =====\n");
  
  console.log("===== 步骤3: 计算投资回报率 =====");
  console.log("搜索比特币价格数据...");
  const priceQuery = "比特币一年前的价格和当前价格";
  const priceSearchResults = await searchTool.invoke(priceQuery);
  console.log("价格搜索结果:", priceSearchResults);
  
  const investmentAnalysis = await investmentAnalysisChain.invoke({});
  console.log("\n投资回报分析结果:");
  console.log(investmentAnalysis);
  console.log("\n===== 步骤3完成 =====\n");
  
  console.log("===== 步骤4: 生成最终分析报告 =====");
  console.log("整合所有数据并生成最终报告...");
  
  const result = await workflowChain.invoke({});
  
  console.log("\n==== 加密货币市场分析报告 ====\n");
  console.log(result);
  console.log("\n===== 工作流执行完成 =====");
}

runWorkflow().catch(console.error);

export { runWorkflow }; 