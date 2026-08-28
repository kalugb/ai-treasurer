from langchain_core.tools import tool
from datetime import datetime

@tool
def get_current_time() -> str:
    """Get the current date and time."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

@tool
def add_numbers(a: float, b: float) -> float:
    """Add two numbers together and return the result."""
    return a + b

@tool
def get_weather(city: str) -> str:
    """Get the current weather for a given city. Use this when the user asks about weather."""
    # Dummy data for testing — swap for a real API call later
    fake_weather = {
        "kuala lumpur": "31°C, sunny",
        "putrajaya": "30°C, partly cloudy",
        "tokyo": "22°C, rainy",
    }
    return fake_weather.get(city.lower(), f"No weather data found for {city}.")