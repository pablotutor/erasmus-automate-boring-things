import os
from ollama import Client
from dotenv import load_dotenv

load_dotenv()


class _Response:
    def __init__(self, content: str):
        self.content = content


class OllamaCloudLLM:
    """Thin wrapper around the ollama Client that mimics the .invoke() interface."""

    def __init__(self):
        self.client = Client(
            host=os.getenv("OLLAMA_BASE_URL", "https://ollama.com"),
            headers={"Authorization": f"Bearer {os.getenv('OLLAMA_API_KEY', '')}"},
        )
        self.model = os.getenv("OLLAMA_MODEL", "gpt-oss:120b")

    def invoke(self, prompt: str) -> _Response:
        response = self.client.chat(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
        )
        content = response["message"]["content"] if isinstance(response, dict) else response.message.content
        return _Response(content)


def get_llm() -> OllamaCloudLLM:
    return OllamaCloudLLM()
