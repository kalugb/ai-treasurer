from sentence_transformers import SentenceTransformer
import sys
import os
from dotenv import load_dotenv
load_dotenv()

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

class EmbeddingClient:
    def __init__(self):
        self.model = SentenceTransformer(os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2"))

    async def generate_embedding(self, text):
        return self.model.encode(text).tolist()
    
embedding_client = EmbeddingClient()
