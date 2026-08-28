from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import HumanMessage, SystemMessage
from dotenv import load_dotenv
import os

load_dotenv()

async def load_nvidia_llm():
    API_KEY = os.getenv("NVIDIA_NIM_API_KEY")
    MODEL_NAME = os.getenv("NVIDIA_NIM_MODEL")
    
    if not API_KEY or not MODEL_NAME:
        raise ValueError("NVIDIA_NIM_API_KEY and NVIDIA_NIM_MODEL must be set in the environment variables.")
    
    llm = ChatNVIDIA(
        model=MODEL_NAME,
        api_key=API_KEY,
        temperature=1,
        top_p=0.95,
    )
    
    return llm

if __name__ == "__main__":
    import asyncio
    
    llm = asyncio.run(load_nvidia_llm())
    
    user_message = "Please provide a brief summary of the latest advancements in AI technology."
    sys_message = "You are a helpful assistant."
    
    message = [
        SystemMessage(content=sys_message),
        HumanMessage(content=user_message)
    ]
    
    response = llm.invoke(message)
    
    print(f"User input: {user_message}")
    print(f"Reply: {response.content}")
    
    # print(f"System full response: {response}")