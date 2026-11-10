from langchain_google_genai import GoogleGenerativeAIEmbeddings

async def generate_embeddings(embedding_client: GoogleGenerativeAIEmbeddings, texts: list[str]) -> list[list[float]]:    
    return embedding_client.embed_documents(texts)

if __name__ == "__main__":
    import asyncio
    from services.ai.embeddings.init_embedding_client import get_client
    
    async def main():
        embedding_client = get_client()
        texts = ["Hello, world!", "This is a test.", "This is another test."]
        embeddings = await generate_embeddings(embedding_client, texts)
        
        print(embeddings)
        print(f"Number of embeddings generated: {len(embeddings)}")
        print("Embedding dimensions:", len(embeddings[0]) if embeddings else "No embeddings generated")
    
    asyncio.run(main())