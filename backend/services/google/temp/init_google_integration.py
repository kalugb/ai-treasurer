from services.google.google_connect import remove_existing_drive_token, get_drive_service

async def create_drive_service():
    """Create and return a Google Drive service instance."""
    remove_existing_drive_token()  # Ensure any existing token is removed
    service = get_drive_service()
    
    return service

if __name__ == "__main__":
    import asyncio
    
    async def main():
        service = await create_drive_service()
        print("Google Drive service initialized successfully.")
        
    asyncio.run(main())