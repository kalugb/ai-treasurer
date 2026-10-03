from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
import os
from dotenv import load_dotenv

load_dotenv()

async def load_groq_llm():
    API_KEY = os.getenv("GROQ_API_KEY")
    MODEL_NAME = os.getenv("GROQ_MODEL")
    
    if not API_KEY or not MODEL_NAME:
        raise ValueError("GROQ_API_KEY and GROQ_MODEL must be set in the environment variables.")
    
    llm = ChatGroq(
        model=MODEL_NAME,
        api_key=API_KEY,
        temperature=0.7,
        reasoning_effort="none",
        model_kwargs={
            "top_p": 0.9,
        }
    )
    
    return llm

if __name__ == "__main__":
    import asyncio
    
    llm = asyncio.run(load_groq_llm())
    
    user_message = "Please provide a brief summary of the latest advancements in AI technology."
    sys_message = "You are a helpful assistant."
    
    message = [
        SystemMessage(content=sys_message),
        HumanMessage(content=user_message)
    ]
    
    response = llm.invoke(message)
    
    print(f"User input: {user_message}")
    print(f"Reply: {response.content}")
    
    print(f"System full response: {response}")