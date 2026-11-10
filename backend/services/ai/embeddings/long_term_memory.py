from langchain_google_genai import GoogleGenerativeAIEmbeddings


async def generate_embeddings(embedding_client: GoogleGenerativeAIEmbeddings, texts: list[str]) -> list[list[float]]:
    # async variant so the event loop isn't blocked while Gemini embeds
    return await embedding_client.aembed_documents(texts)


def _turn_text(user_input: str, output: str) -> str:
    return f"user: {user_input}\nassistant: {output}"


async def embed_turn(embedding_client: GoogleGenerativeAIEmbeddings, user_input: str, output: str) -> list[float]:
    """One vector for a whole chat turn (input + output) — stored as memories.embedding."""
    return (await generate_embeddings(embedding_client, [_turn_text(user_input, output)]))[0]

async def retrieve_embedding(embedding_client: GoogleGenerativeAIEmbeddings, text: str) -> list[float]:
    # query side of retrieval: aembed_query uses task_type RETRIEVAL_QUERY (stored turns use RETRIEVAL_DOCUMENT)
    return await embedding_client.aembed_query(text)

if __name__ == "__main__":
    import asyncio
    from services.ai.embeddings.init_embedding_client import get_embedding_client

    async def main():
        # self-check with a stub (no network)
        class Stub:
            async def aembed_documents(self, texts):
                self.texts = texts
                return [[0.1, 0.2]]

        stub = Stub()
        assert await embed_turn(stub, "hi", "hello") == [0.1, 0.2]
        assert stub.texts == ["user: hi\nassistant: hello"]
        print("stub self-check OK")

        # live check: prints the real vector length (Atlas index numDimensions must match)
        vec = await embed_turn(get_embedding_client(), "How much did marketing spend?", "Marketing spent $120.")
        print("Embedding dimensions:", len(vec))

    asyncio.run(main())
