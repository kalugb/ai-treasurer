# ai/llm_mistral.py
import os
from dotenv import load_dotenv
from langchain_mistralai import ChatMistralAI
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

def load_mistral_llm():
    API_KEY = os.getenv("MISTRAL_API_KEY")
    MODEL_NAME = os.getenv("MISTRAL_LLM_MODEL")
    
    if not API_KEY or not MODEL_NAME:
        raise ValueError("MISTRAL_API_KEY and MISTRAL_LLM_MODEL must be set in the environment variables.")
    
    llm = ChatMistralAI(
        model=MODEL_NAME,
        api_key=API_KEY,
        temperature=0.7,
    )
    
    return llm

if __name__ == "__main__":
    llm = load_mistral_llm()
    
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
    
    
    