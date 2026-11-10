from langchain_google_genai import GoogleGenerativeAIEmbeddings
import os
from dotenv import load_dotenv

load_dotenv()

embedding_model_name = os.getenv("GEMINI_EMBEDDINGS_MODEL", "gemini-embedding-2")
gemini_api_key = os.getenv("GEMINI_API_KEY")

def get_embedding_client():
    if not gemini_api_key:
        raise ValueError("GEMINI_API_KEY is not set in the environment variables.")
    
    embedding_client = GoogleGenerativeAIEmbeddings(
        model=embedding_model_name,
        api_key=gemini_api_key
    )
    
    return embedding_client