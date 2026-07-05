import numpy as np
import json
from pathlib import Path

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from embeddings.embeddings import embedding_client

async def embed_all_skills() -> tuple[list[str], np.ndarray]:
    skill_ids = []
    skill_embeddings = []

    skill_metadata_path = Path(__file__).parent / "skills_metadata.json"
    with open(skill_metadata_path, "r") as f:
        skills = json.load(f)["skills"]

    for skill in skills:
        if skill["enabled"]:
            skill_ids.append(skill["id"])
            doc = " ".join(skill["keywords"]) + " " + skill["description"]
            embedding = await embedding_client.generate_embedding(doc)
            skill_embeddings.append(embedding)

    if not skill_embeddings:
        dim = await embedding_client.get_embedding_dimension() # type: ignore
        return [], np.empty((0, dim), dtype=np.float32)

    return skill_ids, np.array(skill_embeddings, dtype=np.float32)


async def retrieve_relevant_skills(
    query_embedding: list | np.ndarray,
    skill_ids: list[str],
    skill_embeddings: np.ndarray,
    top_k: int = 5,
    threshold: float = 0.35
) -> list[str]:
    if skill_embeddings.shape[0] == 0:
        return []

    query_embedding = np.array(query_embedding, dtype=np.float32)

    # trust me, i don't even know how this math works, it, just, works (cosine similarity)
    similarity_scores = np.dot(skill_embeddings, query_embedding) / (
        np.linalg.norm(skill_embeddings, axis=1) * np.linalg.norm(query_embedding) + 1e-10
    )

    top_k = min(top_k, len(skill_ids))
    top_k_indices = np.argsort(similarity_scores)[-top_k:][::-1]

    return [skill_ids[i] for i in top_k_indices if similarity_scores[i] > threshold]