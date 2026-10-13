from pathlib import Path

token_path = Path(__file__).parent.parent.parent.parent / "google_creds" / "token.json"

def check_google_integration_through_token() -> None:
    if token_path.exists():
        return True
    else:
        return False
    
if __name__ == "__main__":
    print(f"Token path: {token_path}")
    if check_google_integration_through_token():
        print("Google integration is set up correctly.")
    else:
        print("Google integration is not set up. Please check your credentials.")
    