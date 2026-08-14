import os
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
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
    
    @classmethod
    async def get_instance(cls):
        self = cls()
        
        mistral_llm, nvidia_llm = await asyncio.gather(
            load_mistral_llm(),
            load_nvidia_llm()
        )
        
        self.llm_with_fallback = mistral_llm.with_fallbacks(
            [nvidia_llm],
            exceptions_to_handle=(httpx.RequestError, httpx.HTTPStatusError)
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
        
        response = await self.llm_with_fallback.ainvoke(message)
        
        self.chat_history.append({
            "user": user_input,
            "assistant": response.content
        })
        
        self.chat_history = self.chat_history[-10:]
        
        return response.content
    
if __name__ == "__main__":
    async def async_input(prompt: str = ""):
        return await asyncio.to_thread(input, prompt)
    
    async def main():
        llm_inference = await LLMInference.get_instance()
        
        while True:
            print("Enter your prompt: ")
            user_input = await async_input()
            response = await llm_inference.run_llm(user_input)
            
            if user_input.lower() in ["exit", "quit"]:
                print("Exiting...")
                break
            
            print(f"User input: {user_input}")
            print(f"Reply: {response}")
    
    asyncio.run(main())




