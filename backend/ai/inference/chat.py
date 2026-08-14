import os
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain.agents import create_agent
from langchain.agents.middleware import ModelFallbackMiddleware, ModelRetryMiddleware
import sys
import httpx
import asyncio
from datetime import datetime

load_dotenv()

from ai.load_models.load_nvidia import load_nvidia_llm
from ai.load_models.load_mistral import load_mistral_llm
from ai.tools.sample_tool import get_current_time, add_numbers, get_weather

class LLMInference:
    def __init__(self):
        self.llm_with_fallback = None
        self.tool_call_log = []
        self.chat_history = []
        self.tools = [] 
    
    @classmethod
    async def get_instance(cls):
        self = cls()
        
        mistral_llm, nvidia_llm = await asyncio.gather(
            load_mistral_llm(),
            load_nvidia_llm()
        )
        
        self.tools = [get_current_time, add_numbers, get_weather]
        
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
        
        llm_msg_format = {"messages": message}
        
        # result = await self.llm_with_fallback.ainvoke(llm_msg_format)
        result = None
        pending_calls = {}
        async for chunk in self.llm_with_fallback.astream(llm_msg_format, stream_mode="values"):
            last_msg = chunk["messages"][-1]
            
            if isinstance(last_msg, AIMessage) and last_msg.tool_calls:
                for call in last_msg.tool_calls:
                    pending_calls[call["id"]] = {
                        "name": call["name"],
                        "args": call["args"],
                        "requested_at": datetime.now().isoformat()
                    }
                    print(f"Tool call requested: {call['name']} with args: {call['args']}")
            
            if isinstance(last_msg, ToolMessage):
                call_id = last_msg.tool_call_id
                default_record = {
                    "name": last_msg.name,
                    "args": None,
                    "requested_at": None,
                }
                record = pending_calls.pop(call_id, default_record)
                
                self.tool_call_log.append({
                    **record,
                    "result": last_msg.content,
                    "status": "error" if getattr(last_msg, "status", None) == "error" else "success",
                    "user_input": user_input,
                })
                print(f"Tool call completed: {record['name']} with result: {last_msg.content}")
                
            result = chunk
        
        response = result["messages"][-1]
        
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
            
            if user_input.lower() in ["exit", "quit"]:
                print("Exiting...")
                break
            
            response = await llm_inference.run_llm(user_input)
            
            print(f"User input: {user_input}")
            print(f"Reply: {response}")
    
    asyncio.run(main())




