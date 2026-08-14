import os
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langchain.agents import create_agent
from langchain.agents.middleware import ModelFallbackMiddleware, ModelRetryMiddleware
import sys
import httpx
import asyncio

load_dotenv()

from ai.load_models.load_nvidia import load_nvidia_llm
from ai.load_models.load_mistral import load_mistral_llm

class LLMInference:
    def __init__(self):
        self.llm_with_fallback = None
        
        self.chat_history = []
        self.tools = [] 
    
    @classmethod
    async def get_instance(cls):
        self = cls()
        
        mistral_llm, nvidia_llm = await asyncio.gather(
            load_mistral_llm(),
            load_nvidia_llm()
        )
        
        self.llm_with_fallback = create_agent(
            model=mistral_llm,
            tools=self.tools, # tools are empty for now, add later
            middleware=[
                ModelFallbackMiddleware(nvidia_llm),
                ModelRetryMiddleware(max_retries=2, initial_delay=1.0, backoff_factor=2.0)
            ]
        )
        
        return self

    async def run_llm(self, user_input):        
        sys_message = f"""
You are a helpful assistant. Reply to user in a concise way. Use chat history if necessary.   
"""

        message = [SystemMessage(content=sys_message)]
        for turn in self.chat_history:
            message.append(HumanMessage(content=turn["user"]))
            message.append(AIMessage(content=turn["assistant"]))
        message.append(HumanMessage(content=user_input))
        
        result = await self.llm_with_fallback.ainvoke({"messages": message})
        response = result["messages"][-1]
        
        self.chat_history.append({
            "user": user_input,
            "assistant": response.content
        })
        
        self.chat_history = self.chat_history[-10:]
        
        return response.content
        
    async def call_tool(self, tool_name, tool_input):
        pass
    
    
    
if __name__ == "__main__":
    async def async_input(prompt: str = ""):
        return await asyncio.to_thread(input, prompt)
    
    async def main():
        llm_inference = await LLMInference.get_instance()
        
        while True:
            print("Enter your prompt: ")
            user_input = await async_input()
            
            if user_input.lower() in ["exit", "quit"]:
                print("Exiting...")
                break
            
            response = await llm_inference.run_llm(user_input)
            
            print(f"User input: {user_input}")
            print(f"Reply: {response}")
    
    asyncio.run(main())




