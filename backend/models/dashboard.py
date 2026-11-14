from pydantic import BaseModel


class TestPostRequest(BaseModel):
    title: str
    description: str
    amount: float
    date: str
